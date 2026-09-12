import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { OpencodeReviewer } from "../../../src/reviewers/opencode.js";
import type { ReviewerConfig } from "../../../src/schemas.js";

/**
 * Real-child regression (issue-110): opencode was spawned with a cwd but no
 * pinned PWD/--dir, so a child that reads PWD (or that resolves a relative
 * --dir from the shell's notion of "current directory") could still land in
 * the host repo. Runs the actual fixture executable — no child_process mock —
 * so this exercises the real spawn path.
 */
const fixtureBinary = fileURLToPath(new URL("../../fixtures/bin/opencode-cwd-probe.mjs", import.meta.url));

describe("OpencodeReviewer — real-child cwd/PWD pinning", () => {
  let evidenceDir: string;
  let evidenceFile: string;
  const savedMarker = process.env["INSPECTRUM_TEST_MARKER"];
  const savedEvidence = process.env["INSPECTRUM_TEST_EVIDENCE"];
  const savedPwd = process.env["PWD"];

  afterEach(() => {
    if (evidenceDir) rmSync(evidenceDir, { recursive: true, force: true });
    if (savedMarker === undefined) delete process.env["INSPECTRUM_TEST_MARKER"];
    else process.env["INSPECTRUM_TEST_MARKER"] = savedMarker;
    if (savedEvidence === undefined) delete process.env["INSPECTRUM_TEST_EVIDENCE"];
    else process.env["INSPECTRUM_TEST_EVIDENCE"] = savedEvidence;
    if (savedPwd === undefined) delete process.env["PWD"];
    else process.env["PWD"] = savedPwd;
  });

  it("runs the child with cwd, PWD and --dir all equal to the canonical throwaway dir, and leaves the parent's PWD untouched", async () => {
    evidenceDir = mkdtempSync(join(tmpdir(), "inspectrum-opencode-probe-"));
    evidenceFile = join(evidenceDir, "evidence.json");
    process.env["INSPECTRUM_TEST_MARKER"] = "issue-110-marker";
    process.env["INSPECTRUM_TEST_EVIDENCE"] = evidenceFile;
    const sentinelParentPwd = "/tmp/issue-110-parent-pwd-sentinel";
    process.env["PWD"] = sentinelParentPwd;

    const config: ReviewerConfig = { type: "cli", binary: fixtureBinary };
    await new OpencodeReviewer("opencode", config).review("# Plan", "all");

    const evidence = JSON.parse(readFileSync(evidenceFile, "utf8")) as {
      cwd: string;
      pwd: string;
      selectedDir: string;
      marker: string;
      argv: string[];
    };

    const parentCwd = realpathSync(process.cwd());
    expect(evidence.cwd).not.toBe(parentCwd);
    expect(evidence.pwd).toBe(evidence.cwd);
    expect(evidence.selectedDir).toBe(evidence.cwd);
    expect(evidence.marker).toBe("issue-110-marker");
    expect(evidence.argv[evidence.argv.indexOf("--dir") + 1]).toBe(evidence.cwd);
    // The child's synthesized PWD must not leak back into the parent process.
    expect(process.env["PWD"]).toBe(sentinelParentPwd);
  });
});
