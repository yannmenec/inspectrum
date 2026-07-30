import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..", "..");
const pluginRoot = resolve(root, "plugins", "inspectrum");

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function readPluginFile(...parts: string[]): string {
  return readFileSync(resolve(pluginRoot, ...parts), "utf8");
}

const pkg = readJson(resolve(root, "package.json"));

describe("Codex plugin positive contracts", () => {
  it("keeps the inspectrum manifest aligned with package.json", () => {
    const manifest = readJson(resolve(pluginRoot, ".codex-plugin", "plugin.json"));

    expect(manifest).toMatchObject({
      name: "inspectrum",
      version: pkg.version,
      skills: "./skills/",
      mcpServers: "./.mcp.json",
      interface: expect.objectContaining({
        displayName: "Inspectrum",
        category: "Developer Tools",
      }),
    });
  });

  it("exposes inspectrum through the repository marketplace", () => {
    const marketplace = readJson(resolve(root, ".agents", "plugins", "marketplace.json"));

    expect(marketplace).toMatchObject({
      name: "inspectrum",
      interface: { displayName: "Inspectrum" },
      plugins: [{
        name: "inspectrum",
        source: { source: "local", path: "./plugins/inspectrum" },
        policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
        category: "Developer Tools",
      }],
    });
  });

  it("pins the bundled MCP server to the candidate package version", () => {
    const mcp = readJson(resolve(pluginRoot, ".mcp.json"));
    const servers = mcp.mcpServers as Record<string, Record<string, unknown>>;

    expect(servers.inspectrum).toEqual({
      command: "npx",
      args: ["-y", `inspectrum@${String(pkg.version)}`],
    });
  });

  it("routes plan review only to Claude without a judge", () => {
    const skill = readPluginFile("skills", "review-plan-with-claude", "SKILL.md");

    expect(skill).toMatch(/^---\nname: review-plan-with-claude\n/m);
    expect(skill).toMatch(/description: .*(Claude|claude).*(plan|Plan)/);
    expect(skill).toContain("mcp__inspectrum__review_plan");
    expect(skill).toContain('reviewers: ["claude"]');
    expect(skill).toContain("judge: false");
    expect(skill).toContain("report_markdown");
  });

  it("documents local installation and the blocked public smoke test", () => {
    const guide = readFileSync(resolve(root, "docs", "codex-plugin-claude-plan-review.md"), "utf8");

    expect(guide).toContain("codex plugin marketplace add");
    expect(guide).toContain("codex plugin add inspectrum@inspectrum");
    expect(guide).toContain("new task");
    expect(guide).toContain(`inspectrum@${String(pkg.version)}`);
    expect(guide).toContain("blocked");
    expect(guide).toContain("npm");
  });
});

describe("Codex plugin negative contracts", () => {
  it("does not add a second MCP server or tool", () => {
    const mcp = readJson(resolve(pluginRoot, ".mcp.json"));
    const servers = mcp.mcpServers as Record<string, unknown>;
    const serverSource = readFileSync(resolve(root, "src", "server.ts"), "utf8");

    expect(Object.keys(servers)).toEqual(["inspectrum"]);
    expect(serverSource.match(/server\.registerTool\(/g)).toHaveLength(1);
    expect(serverSource).toContain('"review_plan"');
  });

  it("rejects mutable or stale package selectors", () => {
    const mcp = readJson(resolve(pluginRoot, ".mcp.json"));
    const servers = mcp.mcpServers as Record<string, { args: string[] }>;
    const packageSelector = servers.inspectrum.args.at(-1);

    expect(packageSelector).toBe(`inspectrum@${String(pkg.version)}`);
    expect(packageSelector).not.toBe("inspectrum@latest");
    expect(packageSelector).not.toBe("inspectrum@0.2.1");
  });

  it("never turns an unavailable Claude reviewer into a successful review", () => {
    const skill = readPluginFile("skills", "review-plan-with-claude", "SKILL.md");

    expect(skill).toContain("isError");
    expect(skill).toContain("structuredContent");
    expect(skill).toContain("The Claude review did not complete");
    expect(skill).toMatch(/never present.*failure.*approve/is);
  });
});
