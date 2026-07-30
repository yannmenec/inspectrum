import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..", "..");
const scriptPath = resolve(root, "scripts/e2e-plan-gate.sh");

describe("real Codex plan-gate proof", () => {
  it("does not report a successful real review when the gate only fails open", () => {
    const script = readFileSync(scriptPath, "utf8");

    execFileSync("bash", ["-n", scriptPath], { cwd: root });
    expect(script).toContain('RUN_TOKEN="inspectrum-e2e-');
    expect(script).toContain('grep -Fq "$RUN_TOKEN" "$session_dir/plan-input.md"');
    expect(script).toContain("REAL_CODEX_PROOFS");
    expect(script).toContain("real Codex produced no attributable review session");
    expect(script).toContain("PASS (real Codex review session verified");
  });
});
