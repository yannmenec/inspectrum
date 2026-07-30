import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findConfiguredCodexReviewers,
  findRealCodexProofs,
  resolveExecutablePath,
} from "../../../scripts/e2e-gate-proof.mjs";

const root = resolve(import.meta.dirname, "..", "..", "..");
const scriptPath = resolve(root, "scripts/e2e-plan-gate.sh");
const runToken = "inspectrum-e2e-test-token";

let tempDir: string;
let sessionsDir: string;
let markerPath: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "inspectrum-e2e-proof-"));
  sessionsDir = join(tempDir, "sessions");
  markerPath = join(tempDir, "review-start.marker");
  mkdirSync(sessionsDir);
  writeFileSync(markerPath, "");
  setModifiedAt(markerPath, 1_000);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function setModifiedAt(path: string, seconds: number): void {
  const time = new Date(seconds * 1_000);
  utimesSync(path, time, time);
}

function writeSession(
  name: string,
  options: {
    token?: string;
    reviewers?: string[];
    reviewFile?: string;
    modifiedAt?: number;
  } = {},
): string {
  const sessionDir = join(sessionsDir, name);
  mkdirSync(sessionDir);
  writeFileSync(
    join(sessionDir, "plan-input.md"),
    `# Plan ${options.token ?? runToken}`,
  );
  writeFileSync(
    join(sessionDir, "session.json"),
    JSON.stringify({ reviewers: options.reviewers ?? ["codex", "gemini"] }),
  );
  if (options.reviewFile) {
    writeFileSync(join(sessionDir, options.reviewFile), "# Review");
  }
  setModifiedAt(sessionDir, options.modifiedAt ?? 2_000);
  return sessionDir;
}

describe("real Codex plan-gate proof", () => {
  it("accepts a new attributable session with a successful Codex review", async () => {
    const expected = writeSession("new-codex", { reviewFile: "review-codex.md" });

    await expect(
      findRealCodexProofs({
        sessionsDir,
        markerPath,
        runToken,
        reviewerIds: ["codex"],
      }),
    ).resolves.toEqual([expected]);
  });

  it("rejects a session where Codex failed and another reviewer succeeded", async () => {
    writeSession("new-gemini-only", { reviewFile: "review-gemini.md" });

    await expect(
      findRealCodexProofs({
        sessionsDir,
        markerPath,
        runToken,
        reviewerIds: ["codex"],
      }),
    ).resolves.toEqual([]);
  });

  it("accepts an active alias backed by Codex", async () => {
    const expected = writeSession("new-codex-alias", {
      reviewers: ["codex-high"],
      reviewFile: "review-codex-high.md",
    });

    await expect(
      findRealCodexProofs({
        sessionsDir,
        markerPath,
        runToken,
        reviewerIds: ["codex-high"],
      }),
    ).resolves.toEqual([expected]);
  });

  it("rejects a review file not listed among the session reviewers", async () => {
    writeSession("unrelated-codex-file", {
      reviewers: ["gemini"],
      reviewFile: "review-codex.md",
    });

    await expect(
      findRealCodexProofs({
        sessionsDir,
        markerPath,
        runToken,
        reviewerIds: ["codex"],
      }),
    ).resolves.toEqual([]);
  });

  it("rejects matching Codex sessions created before this run", async () => {
    writeSession("old-codex", {
      reviewFile: "review-codex.md",
      modifiedAt: 500,
    });

    await expect(
      findRealCodexProofs({
        sessionsDir,
        markerPath,
        runToken,
        reviewerIds: ["codex"],
      }),
    ).resolves.toEqual([]);
  });

  it("keeps the shell harness syntactically valid", () => {
    execFileSync("bash", ["-n", scriptPath], { cwd: root });
  });
});

describe("configured Codex reviewer discovery", () => {
  const resolveBackend = (
    _id: string,
    reviewer: { backend?: string },
  ): string => reviewer.backend ?? "gemini";

  it("accepts an active Codex alias using the codex binary", () => {
    const config = {
      defaults: { reviewers: ["codex-high"] },
      plan_gate: {},
      reviewers: {
        "codex-high": {
          type: "cli",
          backend: "codex",
          binary: "/opt/homebrew/bin/codex",
        },
      },
    };

    expect(findConfiguredCodexReviewers(config, resolveBackend)).toEqual([
      { id: "codex-high", binary: "/opt/homebrew/bin/codex" },
    ]);
  });

  it("rejects an active reviewer backed by Claude", () => {
    const config = {
      defaults: { reviewers: ["codex"] },
      plan_gate: {},
      reviewers: {
        codex: { type: "cli", backend: "claude", binary: "claude" },
      },
    };

    expect(findConfiguredCodexReviewers(config, resolveBackend)).toEqual([]);
  });

  it("rejects a Codex backend configured with another binary", () => {
    const config = {
      defaults: { reviewers: ["codex"] },
      plan_gate: {},
      reviewers: {
        codex: {
          type: "cli",
          backend: "codex",
          binary: "codex-wrapper",
        },
      },
    };

    expect(findConfiguredCodexReviewers(config, resolveBackend)).toEqual([]);
  });

  it("resolves the exact configured executable from the supplied PATH", () => {
    const executable = join(tempDir, "codex");
    writeFileSync(executable, "#!/bin/sh\n");
    chmodSync(executable, 0o755);

    expect(resolveExecutablePath("codex", tempDir)).toBe(
      realpathSync(executable),
    );
  });
});
