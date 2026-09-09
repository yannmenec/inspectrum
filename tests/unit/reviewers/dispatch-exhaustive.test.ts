import { describe, it, expect, vi, beforeEach } from "vitest";
import { createReviewer, GeminiReviewer } from "../../../src/reviewers/index.js";
import { runBackendJsonReview } from "../../../src/reviewers/common.js";
import type { ReviewerBackend } from "../../../src/reviewers/common.js";
import type { ReviewerConfig } from "../../../src/schemas.js";

/**
 * Regression: both createReviewer() and runBackendJsonReview() used to end with a
 * bare `return ...Gemini...`, so ANY backend value that was added to the enum but
 * forgotten in the dispatch chain silently ran Gemini instead of failing. A user
 * asking for backend X would get a review from a different model, with X's id
 * stamped on the findings.
 *
 * The cast below deliberately fabricates an unhandled backend to stand in for
 * "someone widened the enum and forgot a branch" — the exact scenario the old
 * fallthrough hid.
 */
const UNHANDLED = "totally-unhandled-backend" as unknown as ReviewerBackend;

describe("createReviewer exhaustive dispatch", () => {
  it("throws instead of silently returning a GeminiReviewer for an unhandled backend", () => {
    const config = { type: "cli", backend: UNHANDLED } as unknown as ReviewerConfig;
    expect(() => createReviewer("mystery", config)).toThrow(/unhandled|not supported/i);
  });

  it("does not return a GeminiReviewer for an unhandled backend", () => {
    const config = { type: "cli", backend: UNHANDLED } as unknown as ReviewerConfig;
    let reviewer: unknown;
    try {
      reviewer = createReviewer("mystery", config);
    } catch {
      return; // throwing is the correct behaviour
    }
    expect(reviewer).not.toBeInstanceOf(GeminiReviewer);
  });

  it("still returns a GeminiReviewer when gemini is explicitly requested", () => {
    const reviewer = createReviewer("gemini", { type: "cli", binary: "gemini" });
    expect(reviewer).toBeInstanceOf(GeminiReviewer);
  });
});

describe("runBackendJsonReview exhaustive dispatch", () => {
  it("rejects an unhandled backend instead of running the gemini path", async () => {
    await expect(
      runBackendJsonReview({
        backend: UNHANDLED,
        reviewerId: "mystery",
        config: { type: "cli" },
        systemPrompt: "s",
        userMessage: "u",
        timeoutMs: 5000,
        label: "Mystery",
      }),
    ).rejects.toThrow(/unhandled|not supported/i);
  });
});
