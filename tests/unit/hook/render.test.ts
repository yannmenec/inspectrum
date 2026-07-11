import { describe, it, expect } from "vitest";
import { renderDenyReason } from "../../../src/hook/render.js";
import type { Finding } from "../../../src/schemas.js";

function finding(severity: Finding["severity"], message: string, suggested_fix?: string): Finding {
  return { severity, category: "correctness", reviewer: "codex", message, ...(suggested_fix ? { suggested_fix } : {}) };
}

const base = {
  verdict: "revise" as const,
  round: 1,
  maxRounds: 2,
  sessionPath: "/home/u/.inspectrum/sessions/2026-07-11T10-00-00__ab12cd34",
  budget: 3000,
};

describe("renderDenyReason", () => {
  it("renders the verdict, round counter, and full-report path", () => {
    const out = renderDenyReason({ ...base, findings: [finding("major", "Missing rollback step.")] });
    expect(out).toContain("inspectrum×codex: REVISE (round 1/2)");
    expect(out).toContain("Full report: /home/u/.inspectrum/sessions/2026-07-11T10-00-00__ab12cd34/report.md");
    expect(out).toContain("Revise the plan to address these findings");
  });

  it("orders blockers before majors before minors and drops nits", () => {
    const out = renderDenyReason({
      ...base,
      verdict: "reject",
      findings: [
        finding("nit", "typo"),
        finding("minor", "minor thing"),
        finding("major", "major thing"),
        finding("blocker", "blocker thing"),
      ],
    });
    expect(out.indexOf("blocker thing")).toBeLessThan(out.indexOf("major thing"));
    expect(out.indexOf("major thing")).toBeLessThan(out.indexOf("minor thing"));
    expect(out).not.toContain("typo");
    expect(out).toContain("REJECT");
  });

  it("includes suggested fixes when present", () => {
    const out = renderDenyReason({ ...base, findings: [finding("major", "No tests.", "Add a regression test.")] });
    expect(out).toContain("Fix: Add a regression test.");
  });

  it("caps a single oversized finding message", () => {
    const out = renderDenyReason({ ...base, findings: [finding("blocker", "x".repeat(2000))] });
    expect(out).toContain("[...truncated]");
    expect(out.length).toBeLessThanOrEqual(base.budget);
  });

  it("stays under budget and counts omitted findings", () => {
    const findings = Array.from({ length: 40 }, (_, i) => finding("major", `Finding number ${i} ${"y".repeat(120)}`));
    const out = renderDenyReason({ ...base, budget: 1200, findings });
    expect(out.length).toBeLessThanOrEqual(1200);
    expect(out).toMatch(/\(\+\d+ more findings — see full report\)/);
    expect(out).toContain("Full report:");
  });

  it("keeps the footer even under a hostile tiny budget", () => {
    const out = renderDenyReason({ ...base, budget: 10, findings: [finding("blocker", "big problem")] });
    expect(out).toContain("Full report:");
    expect(out).toContain("inspectrum×codex");
  });

  it("renders cleanly with zero findings", () => {
    const out = renderDenyReason({ ...base, findings: [] });
    expect(out).toContain("REVISE (round 1/2)");
    expect(out).not.toContain("Blockers:");
  });
});
