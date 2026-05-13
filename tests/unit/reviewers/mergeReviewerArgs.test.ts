import { describe, it, expect } from "vitest";
import { mergeReviewerArgs } from "../../../src/reviewers/common.js";

describe("mergeReviewerArgs", () => {
  it("returns empty array for undefined or empty input", () => {
    expect(mergeReviewerArgs(undefined, ["-m"])).toEqual([]);
    expect(mergeReviewerArgs([], ["-m"])).toEqual([]);
  });

  it("drops paired reserved flag and its value", () => {
    expect(mergeReviewerArgs(["-m", "gpt-5", "--temperature", "0.2"], ["-m"]))
      .toEqual(["--temperature", "0.2"]);
  });

  it("drops inline reserved flag (--flag=value form)", () => {
    expect(mergeReviewerArgs(["--model=gpt-5", "--seed", "42"], ["--model"]))
      .toEqual(["--seed", "42"]);
  });

  it("drops bool reserved flag without consuming next arg when next looks like a flag", () => {
    expect(mergeReviewerArgs(["-p", "--temperature", "0.2"], ["-p"]))
      .toEqual(["--temperature", "0.2"]);
  });

  it("preserves order of non-reserved args", () => {
    expect(
      mergeReviewerArgs(
        ["--temperature", "0.2", "--seed", "42", "--top-p", "0.9"],
        ["-m", "--model"],
      ),
    ).toEqual(["--temperature", "0.2", "--seed", "42", "--top-p", "0.9"]);
  });

  it("filters multiple reserved flags in one call", () => {
    expect(
      mergeReviewerArgs(
        ["-m", "gpt-5", "--output-format", "json", "--temperature", "0.2"],
        ["-m", "--model", "--output-format"],
      ),
    ).toEqual(["--temperature", "0.2"]);
  });

  it("drops trailing reserved flag with no value", () => {
    expect(mergeReviewerArgs(["--temperature", "0.2", "-p"], ["-p"]))
      .toEqual(["--temperature", "0.2"]);
  });
});
