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
    // The Claude Desktop row must offer the repaired, versioned bundle (derived
    // from package.json so it can't drift) and still warn users off the broken one.
    expect(readme).toContain(
      `releases/download/v${pkg.version}/inspectrum-${pkg.version}.mcpb`,
    );
    expect(readme).toContain("v0.2.0 bundle was incomplete");
  });

  it("keeps the future npm workflow manual and isolates stage credentials", () => {
    const workflow = readFileSync(
      resolve(root, ".github/workflows/npm-stage.yml"),
      "utf8",
    );
    const onBlock = workflow.slice(workflow.indexOf("\non:\n"), workflow.indexOf("\npermissions:"));
    const validateStart = workflow.indexOf("\n  validate:\n");
    const stageStart = workflow.indexOf("\n  stage:\n");
    const validateBlock = workflow.slice(validateStart, stageStart);
    const stageBlock = workflow.slice(stageStart);
    const publishStepStart = stageBlock.indexOf("\n      - name: Stage the verified candidate\n");
    const beforePublish = stageBlock.slice(0, publishStepStart);
    const publishStep = stageBlock.slice(publishStepStart);

    expect(onBlock.match(/^ {2}[a-z_-]+:/gm)).toEqual(["  workflow_dispatch:"]);
    expect(validateBlock).toContain("npm ci");
    expect(validateBlock).toContain("Smoke the exact candidate");
    expect(validateBlock).toContain('const server = readJson("server.json")');
    expect(validateBlock).not.toContain("id-token: write");
    expect(stageBlock).toContain("needs: validate");
    expect(stageBlock).toContain("environment: npm");
    expect(stageBlock).toContain("id-token: write");
    expect(stageBlock).not.toContain("contents: read");
    expect(stageBlock).toContain("sha256sum -c");
    expect(stageBlock).not.toContain("npm ci");
    expect(stageBlock).not.toMatch(/\bnpm (run|test|pack)\b/);
    expect(stageBlock).not.toContain("actions/checkout@");
    expect(stageBlock).toContain('npm_config_ignore_scripts: "true"');
    expect(beforePublish.match(/ACTIONS_ID_TOKEN_REQUEST_TOKEN: ""/g)).toHaveLength(4);
    expect(beforePublish.match(/ACTIONS_ID_TOKEN_REQUEST_URL: ""/g)).toHaveLength(4);
    expect(publishStep).not.toContain("ACTIONS_ID_TOKEN_REQUEST_");
    expect(publishStep).toContain('run: npm stage publish "$TARBALL" --access public --json');
    expect(publishStep).not.toMatch(/^\s+run:\s*\|/m);
    expect(workflow).toContain(
      'JSON.stringify(pkg.publishConfig) !== JSON.stringify({ access: "public" })',
    );
    expect(workflow).toContain("overwrite: true");
    expect(workflow.match(/^\s*id-token:\s*write\s*$/gm)).toHaveLength(1);
    expect(workflow).toContain('node-version: "24"');
    expect(workflow).toContain("npm@11.15.0");
    expect(workflow).toContain("github.ref_type == 'tag'");
    expect(workflow).toContain("github.ref_name == inputs.tag");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain('git show-ref --verify --quiet "refs/tags/$RELEASE_TAG"');
    expect(workflow).toContain(
      "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
    );
    expect(workflow).toContain(
      "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
    );
    expect(workflow).toContain(
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    );
    expect(workflow).toContain(
      "actions/download-artifact@018cc2cf5baa6db3ef3c5f8a56943fffe632ef53",
    );
    expect(workflow).toContain('npm stage publish "$TARBALL" --access public --json');
    expect(workflow.match(/\bnpm stage publish\b/g)).toHaveLength(1);
    expect(workflow).not.toMatch(/(^|\n)\s*npm publish(?:\s|$)/);
    expect(workflow).not.toMatch(/\bnpm stage approve\b/);
    expect(workflow).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN|provenance\s*[:=]\s*false/i);
  });

  it("keeps release packaging separate from the write-scoped draft release", () => {
    const workflow = readFileSync(
      resolve(root, ".github/workflows/release.yml"),
      "utf8",
    );
    const releaseStart = workflow.indexOf("\n  release:\n");
    const packBlock = workflow.slice(workflow.indexOf("\n  pack:\n"), releaseStart);
    const releaseBlock = workflow.slice(releaseStart);
    const runbook = readFileSync(resolve(root, "CONTRIBUTING.md"), "utf8");

    expect(workflow).toContain("permissions: {}");
    expect(packBlock).toContain("contents: read");
    expect(packBlock).not.toContain("contents: write");
    expect(packBlock).toContain("persist-credentials: false");
    expect(packBlock).toContain("package-manager-cache: false");
    expect(packBlock).not.toContain('cache: "npm"');
    expect(packBlock).not.toContain("softprops/action-gh-release@");
    expect(releaseBlock).toContain("needs: pack");
    expect(releaseBlock).toContain("contents: write");
    expect(releaseBlock).not.toMatch(/\bnpm (ci|run|test|pack)\b/);
    expect(releaseBlock).not.toContain("actions/checkout@");
    expect(releaseBlock).not.toContain("actions/setup-node@");
    expect(releaseBlock).toContain(
      "actions/download-artifact@018cc2cf5baa6db3ef3c5f8a56943fffe632ef53",
    );
    expect(workflow).toContain(
      "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
    );
    expect(workflow).toContain(
      "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38",
    );
    expect(workflow).toContain(
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    );
    expect(workflow).toContain(
      "softprops/action-gh-release@b4309332981a82ec1c5618f44dd2e27cc8bfbfda",
    );
    expect(workflow).toContain("draft: true");
    expect(workflow).not.toMatch(/(^|\n)\s*npm publish(?:\s|$)/);
    expect(runbook).not.toMatch(/(^|\n)\s*npm publish(?:\s|$)/);
    expect(runbook).toContain("gh workflow run npm-stage.yml");
    expect(runbook).toContain("separate explicit authorization");
  });
});
