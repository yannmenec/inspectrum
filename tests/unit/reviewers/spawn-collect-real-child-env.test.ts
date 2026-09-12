import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnCollect } from "../../../src/reviewers/common.js";

/**
 * Real-child regression (issue-110): only OpenCode's caller passes `env` (a
 * synthesized PWD). The other eight spawnCollect callers pass neither `env`
 * nor a synthesized PWD, and must keep inheriting the parent's real
 * environment unchanged — this is what `spawn()` does by default when no
 * `env` option is given. Runs the actual fixture executable, no
 * node:child_process mock, so it exercises the real spawn path.
 */
const fixtureBinary = fileURLToPath(new URL("../../fixtures/bin/opencode-cwd-probe.mjs", import.meta.url));

describe("spawnCollect real-child env inheritance (no env option)", () => {
  let evidenceDir: string;
  let evidenceFile: string;
  let childCwdDir: string;
  const savedMarker = process.env["INSPECTRUM_TEST_MARKER"];
  const savedEvidence = process.env["INSPECTRUM_TEST_EVIDENCE"];
  const savedPwd = process.env["PWD"];

  afterEach(() => {
    if (evidenceDir) rmSync(evidenceDir, { recursive: true, force: true });
    if (childCwdDir) rmSync(childCwdDir, { recursive: true, force: true });
    if (savedMarker === undefined) delete process.env["INSPECTRUM_TEST_MARKER"];
    else process.env["INSPECTRUM_TEST_MARKER"] = savedMarker;
    if (savedEvidence === undefined) delete process.env["INSPECTRUM_TEST_EVIDENCE"];
    else process.env["INSPECTRUM_TEST_EVIDENCE"] = savedEvidence;
    if (savedPwd === undefined) delete process.env["PWD"];
    else process.env["PWD"] = savedPwd;
  });

  it("runs the child in the supplied cwd while inheriting the parent's (sentinel, unnormalized) PWD unchanged", async () => {
    evidenceDir = mkdtempSync(join(tmpdir(), "inspectrum-spawn-env-probe-"));
    evidenceFile = join(evidenceDir, "evidence.json");
    childCwdDir = realpathSync(mkdtempSync(join(tmpdir(), "inspectrum-spawn-env-cwd-")));
    process.env["INSPECTRUM_TEST_MARKER"] = "no-env-marker";
    process.env["INSPECTRUM_TEST_EVIDENCE"] = evidenceFile;
    // A sentinel value that is NOT a real, canonical path: proves spawnCollect
    // passes the parent's PWD through as-is rather than normalizing/deriving
    // it from the child's actual cwd.
    const sentinelParentPwd = "/tmp/issue-110-parent-pwd-sentinel-unnormalized/../unnormalized";
    process.env["PWD"] = sentinelParentPwd;

    await spawnCollect({ binary: fixtureBinary, args: [], timeoutMs: 5000, label: "X", cwd: childCwdDir });

    const evidence = JSON.parse(readFileSync(evidenceFile, "utf8")) as {
      cwd: string;
      pwd: string | undefined;
      marker: string;
    };
    expect(evidence.cwd).toBe(childCwdDir);
    expect(evidence.pwd).toBe(sentinelParentPwd);
    expect(evidence.marker).toBe("no-env-marker");
  });
});
