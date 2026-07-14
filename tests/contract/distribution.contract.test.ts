import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createMcpbManifest,
  mcpbArchiveName,
} from "../../scripts/mcpb-lib.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
const plugin = JSON.parse(readFileSync(resolve(root, ".claude-plugin/plugin.json"), "utf8"));

describe("distribution metadata", () => {
  it("publishes npm and MCP Registry discovery metadata", () => {
    expect(pkg.repository).toEqual({
      type: "git",
      url: "git+https://github.com/yannmenec/inspectrum.git",
    });
    expect(pkg.homepage).toBe("https://github.com/yannmenec/inspectrum#readme");
    expect(pkg.bugs).toEqual({ url: "https://github.com/yannmenec/inspectrum/issues" });
    expect(pkg.mcpName).toBe("io.github.yannmenec/inspectrum");
    expect(pkg.keywords).toEqual(expect.arrayContaining([
      "claude-code",
      "codex-cli",
      "plan-mode",
      "coding-agent",
    ]));
  });

  it("derives every MCPB versioned field from package.json", () => {
    const manifest = createMcpbManifest(pkg);
    expect(manifest).toMatchObject({
      manifest_version: "0.3",
      name: "inspectrum",
      version: pkg.version,
      repository: { type: "git", url: "https://github.com/yannmenec/inspectrum.git" },
      support: "https://github.com/yannmenec/inspectrum/issues",
      privacy_policies: expect.arrayContaining([
        "https://openai.com/policies/privacy-policy/",
        "https://www.anthropic.com/legal/privacy",
        "https://policies.google.com/privacy",
      ]),
      compatibility: { platforms: ["darwin"], runtimes: { node: ">=20" } },
      server: {
        type: "node",
        entry_point: "dist/cli.js",
        mcp_config: {
          command: "node",
          args: ["${__dirname}/dist/cli.js"],
          env: {},
        },
      },
    });
    expect(mcpbArchiveName(pkg)).toBe(`inspectrum-${pkg.version}.mcpb`);
    expect(createMcpbManifest({ ...pkg, version: "9.8.7" }).version).toBe("9.8.7");
    expect([lock.version, lock.packages[""].version, plugin.version]).toEqual([
      pkg.version,
      pkg.version,
      pkg.version,
    ]);
  });

  it("keeps public claims qualified and does not recommend the broken v0.2.0 MCPB", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    expect(readme).toContain("## Quick start");
    expect(readme).toContain("Codex CLI >= 0.99.0");
    expect(readme).toContain(
      "No separate API bill when using your ChatGPT subscription; reviews consume your existing Codex subscription allowance. API-key backends are billed by their provider.",
    );
    expect(readme).not.toContain("60 seconds to your first gated plan");
    expect(readme).not.toContain("no per-token bill");
    expect(readme).not.toContain("releases/latest/download/inspectrum.mcpb");
    expect(readme).not.toMatch(/npx[^\n]*inspectrum@latest plan-gate/);
    expect(readme).toContain("macOS-only v0.2.1 bundle");
  });
});
