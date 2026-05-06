import { describe, it, expect } from "vitest";
import { createReviewer, ClaudeReviewer } from "../../../src/reviewers/index.js";

describe("createReviewer", () => {
  it("returns a ClaudeReviewer for claude cli config", () => {
    const reviewer = createReviewer("claude", { type: "cli", binary: "claude" });
    expect(reviewer).toBeInstanceOf(ClaudeReviewer);
    expect(reviewer.id).toBe("claude");
  });

  it("throws for unimplemented backends", () => {
    expect(() => createReviewer("codex", { type: "cli", binary: "codex" })).toThrow(/not yet implemented/i);
  });

  it("throws for unknown http backend", () => {
    expect(() =>
      createReviewer("some-llm", { type: "http", endpoint: "http://localhost:11434" }),
    ).toThrow(/not yet implemented/i);
  });
});
