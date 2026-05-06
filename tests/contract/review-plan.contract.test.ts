import { describe, it, expect } from "vitest";
import { ReviewPlanInputSchema, ReviewPlanOutputSchema, FindingSchema } from "../../src/schemas.js";

describe("review_plan input contract", () => {
  it("accepts minimal valid input", () => {
    const result = ReviewPlanInputSchema.safeParse({ plan: "# Plan\nsome content" });
    expect(result.success).toBe(true);
  });

  it("rejects missing plan", () => {
    const result = ReviewPlanInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects plan exceeding 16000 chars", () => {
    const result = ReviewPlanInputSchema.safeParse({ plan: "x".repeat(16001) });
    expect(result.success).toBe(false);
  });

  it("accepts plan at exactly 16000 chars", () => {
    const result = ReviewPlanInputSchema.safeParse({ plan: "x".repeat(16000) });
    expect(result.success).toBe(true);
  });

  it("applies default focus=all", () => {
    const result = ReviewPlanInputSchema.parse({ plan: "# Plan" });
    expect(result.focus).toBe("all");
  });

  it("applies default judge=true", () => {
    const result = ReviewPlanInputSchema.parse({ plan: "# Plan" });
    expect(result.judge).toBe(true);
  });

  it("rejects invalid focus value", () => {
    const result = ReviewPlanInputSchema.safeParse({ plan: "# Plan", focus: "vibes" });
    expect(result.success).toBe(false);
  });

  it("rejects context exceeding 8000 chars", () => {
    const result = ReviewPlanInputSchema.safeParse({ plan: "# Plan", context: "x".repeat(8001) });
    expect(result.success).toBe(false);
  });

  it("accepts all focus values", () => {
    for (const focus of ["correctness", "completeness", "risk", "clarity", "all"] as const) {
      const result = ReviewPlanInputSchema.safeParse({ plan: "# Plan", focus });
      expect(result.success, `focus=${focus}`).toBe(true);
    }
  });
});

describe("review_plan output contract", () => {
  const validOutput = {
    verdict: "approve",
    report_markdown: "# Report\nAll good.",
    findings: [],
    session_id: "abc12345",
    session_path: "/Users/test/.inspectrum/sessions/2026-05-06T00-00-00__abc12345",
  };

  it("accepts valid approve output", () => {
    const result = ReviewPlanOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  it("accepts valid revise output with revised_plan", () => {
    const result = ReviewPlanOutputSchema.safeParse({
      ...validOutput,
      verdict: "revise",
      revised_plan: "# Revised Plan\nFixed.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing verdict", () => {
    const { verdict: _, ...rest } = validOutput;
    const result = ReviewPlanOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid verdict", () => {
    const result = ReviewPlanOutputSchema.safeParse({ ...validOutput, verdict: "maybe" });
    expect(result.success).toBe(false);
  });

  it("rejects missing session_id", () => {
    const { session_id: _, ...rest } = validOutput;
    const result = ReviewPlanOutputSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe("Finding contract", () => {
  const validFinding = {
    severity: "blocker",
    category: "correctness",
    reviewer: "claude",
    message: "Missing error handling on DB call",
  };

  it("accepts valid finding", () => {
    expect(FindingSchema.safeParse(validFinding).success).toBe(true);
  });

  it("accepts finding with suggested_fix", () => {
    expect(FindingSchema.safeParse({ ...validFinding, suggested_fix: "Wrap in try/catch" }).success).toBe(true);
  });

  it("rejects invalid severity", () => {
    expect(FindingSchema.safeParse({ ...validFinding, severity: "fatal" }).success).toBe(false);
  });

  it("rejects invalid category", () => {
    expect(FindingSchema.safeParse({ ...validFinding, category: "performance" }).success).toBe(false);
  });

  it("rejects missing message", () => {
    const { message: _, ...rest } = validFinding;
    expect(FindingSchema.safeParse(rest).success).toBe(false);
  });
});
