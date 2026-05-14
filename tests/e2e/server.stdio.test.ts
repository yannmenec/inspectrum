import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
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

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [DIST_SERVER],
      // Isolate the spawned server from the host filesystem: redirect HOME to a
      // throw-away dir so it cannot read/write the developer's real
      // ~/.inspectrum/ during the test.
      env: { ...process.env, HOME: "/tmp/inspectrum-e2e-home", NO_COLOR: "1" },
    });
    client = new Client({ name: "inspectrum-e2e", version: "1.0.0" });
    await client.connect(transport);
  }, 15_000);

  afterAll(async () => {
    await client?.close();
  });

  it("exposes exactly one tool named review_plan with input + output schemas", async () => {
    const result = await client.listTools();
    expect(result.tools).toHaveLength(1);
    const tool = result.tools[0]!;
    expect(tool.name).toBe("review_plan");
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
