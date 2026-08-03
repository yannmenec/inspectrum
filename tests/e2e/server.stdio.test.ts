import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DIST_SERVER = resolve(__dirname, "..", "..", "dist", "server.js");
const HAS_DIST = existsSync(DIST_SERVER);

// Skip the entire suite when dist/server.js is not present (fresh clone, no build).
// CI is configured to build before running tests; locally, `npm run build && npm test`
// is the supported path.
describe.skipIf(!HAS_DIST)("MCP server — stdio e2e smoke", () => {
  let client: Client;
  let transport: StdioClientTransport;
  let isolatedHome: string;

  beforeAll(async () => {
    // Isolate the spawned server from the host filesystem: redirect HOME to a
    // per-test tmpdir so it cannot read/write the developer's real
    // ~/.inspectrum/ during the test. mkdtemp (not a hardcoded path) so
    // concurrent local + CI runs don't collide.
    isolatedHome = mkdtempSync(join(tmpdir(), "inspectrum-e2e-"));
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [DIST_SERVER],
      env: { ...process.env, HOME: isolatedHome, NO_COLOR: "1" },
    });
    client = new Client({ name: "inspectrum-e2e", version: "1.0.0" });
    await client.connect(transport);
  }, 15_000);

  afterAll(async () => {
    await client?.close();
    if (isolatedHome) {
      rmSync(isolatedHome, { recursive: true, force: true });
    }
  });

  it("exposes exactly one tool named review_plan with input + output schemas", async () => {
    const result = await client.listTools();
    expect(result.tools).toHaveLength(1);
    const tool = result.tools[0]!;
    expect(tool.name).toBe("review_plan");
    expect(tool.annotations).toMatchObject({
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
      openWorldHint: true,
    });
    expect(tool.inputSchema).toBeDefined();
    const inputProps = (tool.inputSchema.properties ?? {}) as Record<string, unknown>;
    expect(Object.keys(inputProps).sort()).toEqual(["context", "focus", "judge", "plan", "reviewers"]);
    expect(tool.outputSchema).toBeDefined();
    const outputProps = ((tool.outputSchema as { properties?: Record<string, unknown> }).properties ?? {});
    expect(Object.keys(outputProps).sort()).toEqual([
      "findings",
      "report_markdown",
      "revised_plan",
      "session_id",
      "session_path",
      "verdict",
    ]);
  });

  it("publishes exactly one static resource (inspectrum://sessions)", async () => {
    const result = await client.listResources();
    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]!.uri).toBe("inspectrum://sessions");
  });

  it("publishes exactly one resource template (inspectrum://sessions/{id}/{file})", async () => {
    const result = await client.listResourceTemplates();
    expect(result.resourceTemplates).toHaveLength(1);
    expect(result.resourceTemplates[0]!.uriTemplate).toBe("inspectrum://sessions/{id}/{file}");
  });

  it("rejects path-traversal in resources/read (URL-encoded ../)", async () => {
    await expect(
      client.readResource({ uri: "inspectrum://sessions/abcd1234/%2E%2E%2Fetc%2Fpasswd" }),
    ).rejects.toThrow();
  });

  it("rejects path-traversal in resources/read (literal ../)", async () => {
    await expect(
      client.readResource({ uri: "inspectrum://sessions/abcd1234/../etc/passwd" }),
    ).rejects.toThrow();
  });
});

// #67: an invalid ~/.inspectrum/config.toml killed the server with an unhandled
// ZodError, leaving "Server disconnected" as the host's only diagnostic. Startup
// must fail closed with a message that is legible in a raw MCP host log.
describe.skipIf(!HAS_DIST)("MCP server — invalid config startup (#67)", () => {
  it("exits 1 with a readable message and no stack trace", () => {
    const home = mkdtempSync(join(tmpdir(), "inspectrum-e2e-badconfig-"));
    try {
      mkdirSync(join(home, ".inspectrum"), { recursive: true });
      writeFileSync(join(home, ".inspectrum", "config.toml"), '[reviewers.codex]\ntype = "nonsense"\n');
      const result = spawnSync(process.execPath, [DIST_SERVER], {
        env: { ...process.env, HOME: home, NO_COLOR: "1" },
        input: "",
        encoding: "utf8",
        timeout: 15_000,
      });

      expect(result.status).toBe(1);
      const stderr = String(result.stderr);
      expect(stderr).toContain(join(home, ".inspectrum", "config.toml"));
      expect(stderr).toContain("reviewers.codex.type");
      expect(stderr).toContain('"nonsense"');
      expect(stderr).not.toContain("ZodError");
      expect(stderr).not.toContain("    at ");
      expect(stderr).not.toMatch(/^Node\.js v/m);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
