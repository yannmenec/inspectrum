#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const argv = process.argv.slice(2);
const realBinary = process.env.CODEX_REAL_BINARY ?? "codex";
const captureFile = await resolveCaptureFile();
const stdin = Buffer.concat(await readAll(process.stdin));
const startedAt = new Date().toISOString();
const startedNs = process.hrtime.bigint();
const child = spawn(realBinary, argv, { stdio: ["pipe", "pipe", "pipe"] });
const stdout = [];
const stderr = [];

child.stdout.on("data", (chunk) => {
  stdout.push(chunk);
  process.stdout.write(chunk);
});
child.stderr.on("data", (chunk) => {
  stderr.push(chunk);
  process.stderr.write(chunk);
});
child.stdin.on("error", () => {});
child.stdin.end(stdin);

const outcome = await new Promise((resolve) => {
  child.once("error", (error) => resolve({ code: 127, signal: null, error: error.message }));
  child.once("close", (code, signal) => resolve({ code, signal, error: null }));
});
const stdoutBuffer = Buffer.concat(stdout);
const stderrBuffer = Buffer.concat(stderr);
const outputPath = pairedArg(argv, "--output-last-message");
const lastMessage = outputPath ? await readFile(outputPath, "utf8").catch(() => null) : null;

if (captureFile) {
  await mkdir(dirname(captureFile), { recursive: true });
  await writeFile(captureFile, JSON.stringify({
    schema_version: 1,
    started_at: startedAt,
    ended_at: new Date().toISOString(),
    wrapper_duration_ms: Number(process.hrtime.bigint() - startedNs) / 1e6,
    binary: realBinary,
    argv,
    stdin: stdin.toString("utf8"),
    stdin_sha256: sha256(stdin),
    stdout: stdoutBuffer.toString("utf8"),
    stdout_sha256: sha256(stdoutBuffer),
    stderr: stderrBuffer.toString("utf8"),
    stderr_sha256: sha256(stderrBuffer),
    output_last_message_path: outputPath,
    last_message: lastMessage,
    exit_code: outcome.code,
    signal: outcome.signal,
    spawn_error: outcome.error,
  }, null, 2), { mode: 0o600 });
}

if (outcome.signal) process.kill(process.pid, outcome.signal);
process.exitCode = outcome.code ?? 1;

async function readAll(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return chunks;
}

function pairedArg(args, name) {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : null;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function resolveCaptureFile() {
  if (process.env.INSPECTRUM_CAPTURE_FILE) return process.env.INSPECTRUM_CAPTURE_FILE;
  const captureDir = process.env.INSPECTRUM_CAPTURE_DIR;
  const callIdFile = process.env.INSPECTRUM_CALL_ID_FILE;
  if (!captureDir || !callIdFile) return null;
  const callId = (await readFile(callIdFile, "utf8")).trim();
  if (!/^[A-Za-z0-9._-]+$/.test(callId)) throw new Error("invalid benchmark call id");
  return join(captureDir, `${callId}.json`);
}
