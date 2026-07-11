import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CodexReviewer } from "../../src/reviewers/codex.js";
import { RawReviewSchema } from "../../src/schemas.js";

/**
 * Real-CLI smoke, opt-in only (ADR-0002): validates that the canonical
 * `codex exec --ephemeral --skip-git-repo-check -s read-only
 * -c model_reasoning_effort=low --output-schema … --output-last-message …`
 * invocation works against the installed codex binary — including the bare
 * (unquoted) -c value form. Requires a codex login. Never runs in CI.
 *
 *   INSPECTRUM_E2E_CODEX=1 npx vitest run tests/integration/
 */
const enabled = !!process.env["INSPECTRUM_E2E_CODEX"];

describe.skipIf(!enabled)("real codex smoke (INSPECTRUM_E2E_CODEX=1)", () => {
  it("reviews a trivial plan with -s read-only and low reasoning effort", async () => {
    const plan = readFileSync(
      fileURLToPath(new URL("../fixtures/plans/trivial-correct.md", import.meta.url)),
      "utf8",
    );
    const reviewer = new CodexReviewer("codex", { type: "cli", effort: "low" }, 300_000);
    const review = await reviewer.review(plan, "all");

    const parsed = RawReviewSchema.safeParse(review);
    expect(parsed.success, JSON.stringify(review).slice(0, 500)).toBe(true);
    expect(review.reviewer).toBe("codex");
    expect(review.findings.every((f) => f.reviewer === "codex")).toBe(true);
  }, 320_000);
});
