import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process");

import * as childProcess from "node:child_process";
import { checkReviewer } from "../../../src/reviewers/health.js";

const mockExecFileSync = vi.mocked(childProcess.execFileSync);

/**
 * The gemini harness is being retired in favour of agy. It stays functional for
 * now, but `inspectrum doctor` must tell users it is deprecated so they can
 * migrate before the code is removed. The warning must NOT mark the reviewer
 * unhealthy (ok stays true) — deprecated is not broken.
 */
describe("gemini deprecation notice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env["GEMINI_API_KEY"] = "test-key";
  });

  it("warns that gemini is deprecated", async () => {
    mockExecFileSync.mockReturnValue("gemini 0.1.0" as never);
    const result = await checkReviewer("gemini", { type: "cli", binary: "gemini" });
    expect(result.warning).toMatch(/deprecated/i);
  });

  it("names agy as the replacement", async () => {
    mockExecFileSync.mockReturnValue("gemini 0.1.0" as never);
    const result = await checkReviewer("gemini", { type: "cli", binary: "gemini" });
    expect(result.warning).toMatch(/agy/i);
  });

  it("keeps gemini healthy (deprecated is not broken)", async () => {
    mockExecFileSync.mockReturnValue("gemini 0.1.0" as never);
    const result = await checkReviewer("gemini", { type: "cli", binary: "gemini" });
    expect(result.ok).toBe(true);
  });

  it("warns for an aliased gemini reviewer resolved via explicit backend", async () => {
    mockExecFileSync.mockReturnValue("gemini 0.1.0" as never);
    const result = await checkReviewer("my-gemini", { type: "cli", backend: "gemini", binary: "gemini" });
    expect(result.warning).toMatch(/deprecated/i);
  });

  it("does not warn about deprecation for other backends", async () => {
    mockExecFileSync.mockReturnValue("1.0.0" as never);
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    const result = await checkReviewer("claude", { type: "cli", binary: "claude" });
    expect(result.warning ?? "").not.toMatch(/deprecated/i);
  });
});
