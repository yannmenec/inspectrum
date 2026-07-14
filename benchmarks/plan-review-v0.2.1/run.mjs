#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  assertValidOrders,
  buildConfig,
  buildSchedule,
  buildToolArguments,
  normalizeForPublication,
} from "./lib.mjs";

const execFile = promisify(execFileCallback);
const benchmarkDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(benchmarkDir, "../..");
const preregistration = JSON.parse(await readFile(join(benchmarkDir, "preregistration.json"), "utf8"));
const orders = JSON.parse(await readFile(join(benchmarkDir, "orders.json"), "utf8"));
const fixtureIds = Object.keys(preregistration.corpus.fixtures);
assertValidOrders(orders, fixtureIds);
const schedule = buildSchedule(orders);
await verifyFixtures();
await verifyArtifacts();

const cli = parseArgs(process.argv.slice(2));
if (cli.help) {
  printHelp();
} else if (cli.dryRun) {
  console.log(JSON.stringify({
    package: preregistration.package,
    condition: preregistration.condition,
    schedule,
    request_shape: { reviewers: ["codex"], focus: "all", judge: false },
    labels_opened_by_runner: false,
  }, null, 2));
} else if (cli.execute) {
  await execute(cli);
} else {
  throw new Error("choose --dry-run or --execute; use --help for usage");
}

async function execute(cliArgs) {
  if (!/^[A-Za-z0-9._-]+$/.test(cliArgs.runId ?? "")) throw new Error("--run-id is required and must be filename-safe");
  if (!cliArgs.privateRoot) throw new Error("--private-root is required for unsanitized evidence");
  const privateRoot = resolve(cliArgs.privateRoot);
  if (privateRoot === repoRoot || privateRoot.startsWith(repoRoot + sep)) {
    throw new Error("--private-root must be outside the repository");
  }

  const publicDir = join(benchmarkDir, "raw");
  const publicFile = join(publicDir, `${cliArgs.runId}.jsonl`);
  const publicMetaFile = join(publicDir, `${cliArgs.runId}.meta.json`);
  const privateRunDir = join(privateRoot, cliArgs.runId);
  if (existsSync(publicFile) || existsSync(publicMetaFile) || existsSync(privateRunDir)) {
    throw new Error(`run ${cliArgs.runId} already exists; retries require a new run ID`);
  }
  await mkdir(publicDir, { recursive: true });
  await mkdir(join(privateRunDir, "provider"), { recursive: true, mode: 0o700 });
  await mkdir(join(privateRunDir, "records"), { recursive: true, mode: 0o700 });

  const runtime = await preflight();
  const startedAt = new Date().toISOString();
  const wallStart = Date.now();
  const runErrors = [];
  let attempted = 0;
  let stopped = false;

  for (let blockIndex = 0; blockIndex < orders.blocks.length && !stopped; blockIndex += 1) {
    const block = blockIndex + 1;
    const blockRoot = await mkdtemp(join(tmpdir(), `inspectrum-eval-b${block}-`));
    const isolatedHome = join(blockRoot, "home");
    const emptyCwd = join(blockRoot, "empty-cwd");
    const callIdFile = join(blockRoot, "current-call.txt");
    const captureDir = join(privateRunDir, "provider");
    const configPath = join(isolatedHome, ".inspectrum", "config.toml");
    const config = buildConfig({
      model: preregistration.condition.model,
      effort: preregistration.condition.effort,
      wrapper: join(benchmarkDir, "codex-trace-wrapper.mjs"),
    });
    await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
    await mkdir(emptyCwd, { recursive: true });
    await writeFile(configPath, config, { mode: 0o600 });

    const stderrChunks = [];
    const transport = new StdioClientTransport({
      command: "npm",
      args: ["exec", "--yes", "--package=inspectrum@0.2.1", "--", "inspectrum"],
      cwd: emptyCwd,
      stderr: "pipe",
      env: benchmarkEnvironment({
        home: isolatedHome,
        codexHome: runtime.codex_home,
        codexBinary: runtime.codex_binary,
        captureDir,
        callIdFile,
      }),
    });
    transport.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    const client = new Client({ name: "inspectrum-synthetic-evaluation", version: "1.0.0" });
    let toolInventory;
    try {
      await client.connect(transport);
      toolInventory = await client.listTools();
      const names = toolInventory.tools.map((tool) => tool.name);
      if (names.length !== 1 || names[0] !== "review_plan") throw new Error(`unexpected tool inventory: ${names.join(", ")}`);
    } catch (error) {
      const blockError = serializeError(error);
      runErrors.push({ block, phase: "mcp_start", error: blockError });
      await writeJson(join(privateRunDir, `block-${block}-error.json`), blockError);
      stopped = true;
    }

    if (!stopped) {
      for (let positionIndex = 0; positionIndex < orders.blocks[blockIndex].length; positionIndex += 1) {
        if ((Date.now() - wallStart) / 1000 >= preregistration.execution.maximum_wallclock_seconds) {
          runErrors.push({ block, phase: "wallclock_cap", error: { message: "pre-registered wallclock cap reached" } });
          stopped = true;
          break;
        }
        const fixtureId = orders.blocks[blockIndex][positionIndex];
        const callId = `b${block}-p${positionIndex + 1}-${fixtureId}`;
        await writeFile(callIdFile, `${callId}\n`, { mode: 0o600 });
        const fixture = preregistration.corpus.fixtures[fixtureId];
        const plan = await readFile(join(repoRoot, fixture.path), "utf8");
        const request = { name: "review_plan", arguments: buildToolArguments(plan) };
        const stderrStart = stderrChunks.length;
        const callStartedAt = new Date().toISOString();
        const callStart = process.hrtime.bigint();
        let response = null;
        let error = null;
        const status = {
          mcp_started: true,
          tool_responded: false,
          schema_valid: false,
          reviewer_succeeded: false,
          session_complete: false,
        };

        try {
          response = await client.callTool(request, undefined, {
            timeout: preregistration.condition.sdk_timeout_seconds * 1000,
            maxTotalTimeout: preregistration.condition.sdk_timeout_seconds * 1000,
          });
          status.tool_responded = true;
        } catch (caught) {
          error = serializeError(caught);
        }

        const durationMs = Number(process.hrtime.bigint() - callStart) / 1e6;
        const structured = response?.structuredContent ?? null;
        status.schema_valid = isReviewResult(structured);
        const tracePath = join(captureDir, `${callId}.json`);
        const providerTrace = await readJsonIfPresent(tracePath);
        status.reviewer_succeeded = Boolean(providerTrace?.exit_code === 0 && status.schema_valid && !response?.isError);
        const sessionFiles = status.schema_valid ? await readSession(structured.session_path, isolatedHome) : null;
        status.session_complete = Boolean(sessionFiles?.complete && sessionFiles.files["plan-input.md"] === plan);

        const record = {
          schema_version: 1,
          run_id: cliArgs.runId,
          call_id: callId,
          block,
          position: positionIndex + 1,
          fixture_id: fixtureId,
          fixture_path: fixture.path,
          plan_sha256: fixture.sha256,
          started_at: callStartedAt,
          ended_at: new Date().toISOString(),
          duration_ms: durationMs,
          package: preregistration.package,
          runtime,
          config: { text: config, sha256: sha256(config) },
          request,
          tool_inventory: {
            count: toolInventory.tools.length,
            names: toolInventory.tools.map((tool) => tool.name),
            review_plan_has_output_schema: Boolean(toolInventory.tools[0]?.outputSchema),
          },
          response_raw: response,
          result: status.schema_valid ? { verdict: structured.verdict, findings: structured.findings } : null,
          provider_trace: providerTrace,
          server_stderr: Buffer.concat(stderrChunks.slice(stderrStart)).toString("utf8"),
          session: sessionFiles,
          status,
          error,
        };
        const privateRecordPath = join(privateRunDir, "records", `${callId}.json`);
        await writeJson(privateRecordPath, record);
        const replacements = [
          [repoRoot, "$REPO"],
          [runtime.original_home, "$HOME"],
          [runtime.codex_home, "$CODEX_HOME"],
          [runtime.codex_binary, "$CODEX_BIN"],
          [privateRunDir, "$PRIVATE_RUN"],
          [blockRoot, "$RUN_ROOT"],
        ];
        const published = normalizeForPublication({
          ...record,
          publication_normalizations: replacements.map(([source, target]) => ({ source_sha256: sha256(source), target })),
        }, replacements);
        await appendFile(publicFile, `${JSON.stringify(published)}\n`, { mode: 0o600 });
        attempted += 1;
      }
    }

    await client.close().catch(() => {});
    await rm(blockRoot, { recursive: true, force: true });
  }

  const meta = {
    schema_version: 1,
    run_id: cliArgs.runId,
    started_at: startedAt,
    ended_at: new Date().toISOString(),
    attempted_calls: attempted,
    planned_calls: schedule.length,
    complete: attempted === schedule.length && runErrors.length === 0,
    runtime: normalizeForPublication(runtime, [
      [runtime.original_home, "$HOME"],
      [runtime.codex_home, "$CODEX_HOME"],
      [runtime.codex_binary, "$CODEX_BIN"],
      [repoRoot, "$REPO"],
    ]),
    errors: runErrors,
  };
  await writeJson(join(privateRunDir, "run.json"), meta);
  await writeJson(publicMetaFile, meta);
  console.log(JSON.stringify(meta, null, 2));
  if (!meta.complete) process.exitCode = 2;
}

async function preflight() {
  const scratch = await mkdtemp(join(tmpdir(), "inspectrum-eval-preflight-"));
  try {
    const packageVersion = (await execFile("npm", ["exec", "--yes", "--package=inspectrum@0.2.1", "--", "inspectrum", "--version"], { cwd: scratch })).stdout.trim();
    if (packageVersion !== preregistration.package.version) throw new Error(`published package returned ${packageVersion}`);
    const npmMeta = JSON.parse((await execFile("npm", ["view", "inspectrum@0.2.1", "version", "dist.integrity", "dist.shasum", "gitHead", "--json"], { cwd: scratch })).stdout);
    if (npmMeta.version !== preregistration.package.version || npmMeta["dist.integrity"] !== preregistration.package.integrity || npmMeta["dist.shasum"] !== preregistration.package.shasum || npmMeta.gitHead !== preregistration.package.git_head) {
      throw new Error("published npm metadata differs from preregistration");
    }
    const codexVersionOutput = (await execFile("codex", ["--version"])).stdout.trim();
    if (!codexVersionOutput.includes(preregistration.condition.codex_cli)) throw new Error(`Codex CLI changed: ${codexVersionOutput}`);
    const codexBinary = (await execFile("which", ["codex"])).stdout.trim();
    const originalHome = process.env.HOME ?? homedir();
    const codexHome = process.env.CODEX_HOME ?? join(originalHome, ".codex");
    return {
      node: process.version,
      npm: (await execFile("npm", ["--version"])).stdout.trim(),
      os: process.platform,
      arch: process.arch,
      codex_cli: codexVersionOutput,
      codex_binary: codexBinary,
      codex_home: codexHome,
      original_home: originalHome,
      model: preregistration.condition.model,
      model_alias_may_be_mutable: true,
      effort: preregistration.condition.effort,
      environment_keys_forwarded: benchmarkEnvironment({ home: "", codexHome: "", codexBinary: "", captureDir: "", callIdFile: "" }, true),
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function benchmarkEnvironment(values, keysOnly = false) {
  const env = {
    HOME: values.home,
    PATH: process.env.PATH ?? "",
    CODEX_HOME: values.codexHome,
    CODEX_REAL_BINARY: values.codexBinary,
    INSPECTRUM_CAPTURE_DIR: values.captureDir,
    INSPECTRUM_CALL_ID_FILE: values.callIdFile,
    NO_COLOR: "1",
  };
  for (const key of ["TMPDIR", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy", "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return keysOnly ? Object.keys(env).sort() : env;
}

async function verifyFixtures() {
  for (const [id, fixture] of Object.entries(preregistration.corpus.fixtures)) {
    const plan = await readFile(join(repoRoot, fixture.path));
    if (sha256(plan) !== fixture.sha256) throw new Error(`fixture hash changed: ${id}`);
  }
}

async function verifyArtifacts() {
  for (const [name, expected] of Object.entries(preregistration.artifact_hashes)) {
    const actual = sha256(await readFile(join(benchmarkDir, name)));
    if (actual !== expected) throw new Error(`pre-registered artifact changed: ${name}`);
  }
}

async function readSession(sessionPath, isolatedHome) {
  const expectedRoot = resolve(isolatedHome, ".inspectrum", "sessions");
  const resolved = resolve(sessionPath);
  if (resolved !== expectedRoot && !resolved.startsWith(expectedRoot + sep)) return { complete: false, files: {}, error: "session path escaped isolated home" };
  try {
    const names = await readdir(resolved);
    const files = {};
    for (const name of names.sort()) files[name] = await readFile(join(resolved, name), "utf8");
    const required = ["plan-input.md", "report.md", "review-codex.md", "session.json"];
    return { complete: required.every((name) => typeof files[name] === "string"), files };
  } catch (error) {
    return { complete: false, files: {}, error: serializeError(error) };
  }
}

function isReviewResult(value) {
  return Boolean(value && ["approve", "revise", "reject"].includes(value.verdict) && Array.isArray(value.findings) && typeof value.report_markdown === "string" && typeof value.session_id === "string" && typeof value.session_path === "string");
}

async function readJsonIfPresent(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function serializeError(error) {
  return { name: error?.name ?? "Error", message: error?.message ?? String(error), code: error?.code ?? null };
}

function parseArgs(args) {
  const parsed = { dryRun: false, execute: false, help: false, runId: null, privateRoot: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--execute") parsed.execute = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--run-id") parsed.runId = args[++index];
    else if (arg === "--private-root") parsed.privateRoot = args[++index];
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (parsed.dryRun && parsed.execute) throw new Error("--dry-run and --execute are mutually exclusive");
  return parsed;
}

function printHelp() {
  console.log("Usage: node run.mjs --dry-run | --execute --run-id <id> --private-root <outside-repo-path>");
}
