import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process");

import * as childProcess from "node:child_process";
import { checkReviewer } from "../../../src/reviewers/health.js";

const mockExecFileSync = vi.mocked(childProcess.execFileSync);

/**
 * agy (Google's Antigravity CLI) cannot be confined: probed on agy 1.1.27,
 * neither `--sandbox` nor `--mode plan` stops a write to /tmp (the CLI itself
 * warns that plan mode "has no effect while slash command expansion is
 * disabled", and removing that pin still allowed the write). A plan under
 * review is untrusted input, so `inspectrum doctor` must tell agy users that
 * the reviewer can act on the plan. Like the deprecation notice, the warning
 * must NOT mark the reviewer unhealthy (ok stays true) — unconfined is not
 * broken, it is a property of the backend.
 */
describe("agy unconfined warning", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("warns that agy cannot be confined", async () => {
    mockExecFileSync.mockReturnValue("agy 1.1.27" as never);
    const result = await checkReviewer("agy", { type: "cli", binary: "agy" });
    expect(result.warning).toMatch(/cannot be confined/i);
  });

  it("points at the confined alternatives", async () => {
    mockExecFileSync.mockReturnValue("agy 1.1.27" as never);
    const result = await checkReviewer("agy", { type: "cli", binary: "agy" });
    expect(result.warning).toMatch(/prefer muse/);
  });

  it("keeps agy healthy (unconfined is not broken)", async () => {
    mockExecFileSync.mockReturnValue("agy 1.1.27" as never);
    const result = await checkReviewer("agy", { type: "cli", binary: "agy" });
    expect(result.ok).toBe(true);
  });

  it("warns for an aliased agy reviewer resolved via explicit backend", async () => {
    mockExecFileSync.mockReturnValue("agy 1.1.27" as never);
    const result = await checkReviewer("my-agy", { type: "cli", backend: "agy", binary: "agy" });
    expect(result.warning).toMatch(/cannot be confined/i);
  });

  it("does not warn about confinement for other backends", async () => {
    mockExecFileSync.mockReturnValue("1.0.0" as never);
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    const result = await checkReviewer("claude", { type: "cli", binary: "claude" });
    expect(result.warning ?? "").not.toMatch(/cannot be confined/i);
  });
});
