import { describe, it, expect } from "vitest";
import { mergeReviewerArgs } from "../../../src/reviewers/common.js";

describe("mergeReviewerArgs", () => {
  it("returns empty array for undefined or empty input", () => {
    expect(mergeReviewerArgs(undefined, { bool: [], paired: ["-m"] })).toEqual([]);
    expect(mergeReviewerArgs([], { bool: [], paired: ["-m"] })).toEqual([]);
  });

  it("drops paired reserved flag and its value", () => {
    expect(
      mergeReviewerArgs(["-m", "gpt-5", "--temperature", "0.2"], { bool: [], paired: ["-m"] }),
    ).toEqual(["--temperature", "0.2"]);
  });

  it("drops paired reserved flag whose value starts with '-' (no leak)", () => {
    // Regression: the heuristic implementation would leak "-foo" because it
    // looked like a flag, not a value. Arity-aware filtering must drop both.
    expect(
      mergeReviewerArgs(["--model", "-foo", "--keep"], { bool: [], paired: ["--model"] }),
    ).toEqual(["--keep"]);
  });

  it("drops inline reserved flag (--flag=value form)", () => {
    expect(
      mergeReviewerArgs(["--model=gpt-5", "--seed", "42"], { bool: [], paired: ["--model"] }),
    ).toEqual(["--seed", "42"]);
  });

  it("drops inline reserved bool flag (--flag=value form)", () => {
    expect(
      mergeReviewerArgs(["--print=on", "--keep"], { bool: ["--print"], paired: [] }),
    ).toEqual(["--keep"]);
  });

  it("drops bool reserved flag without consuming the next arg", () => {
    expect(
      mergeReviewerArgs(["-p", "--temperature", "0.2"], { bool: ["-p"], paired: [] }),
    ).toEqual(["--temperature", "0.2"]);
  });

  it("preserves order of non-reserved args", () => {
    expect(
      mergeReviewerArgs(
        ["--temperature", "0.2", "--seed", "42", "--top-p", "0.9"],
        { bool: [], paired: ["-m", "--model"] },
      ),
    ).toEqual(["--temperature", "0.2", "--seed", "42", "--top-p", "0.9"]);
  });

  it("filters mixed bool + paired reserved flags in one call", () => {
    expect(
      mergeReviewerArgs(
        ["-m", "gpt-5", "--output-format", "json", "--print", "--temperature", "0.2"],
        { bool: ["--print"], paired: ["-m", "--model", "--output-format"] },
      ),
    ).toEqual(["--temperature", "0.2"]);
  });

  it("drops trailing paired reserved flag with no value", () => {
    expect(
      mergeReviewerArgs(["--temperature", "0.2", "-m"], { bool: [], paired: ["-m"] }),
    ).toEqual(["--temperature", "0.2"]);
  });
});
