import { describe, it, expect } from "vitest";
import {
  createReviewer,
  ClaudeReviewer,
  CodexReviewer,
  GeminiReviewer,
  OllamaReviewer,
  OpenRouterReviewer,
  KimiReviewer,
  QwenReviewer,
} from "../../../src/reviewers/index.js";
import { runBackendJsonReview } from "../../../src/reviewers/common.js";

describe("createReviewer", () => {
  it("returns a ClaudeReviewer for claude cli config", () => {
    const reviewer = createReviewer("claude", { type: "cli", binary: "claude" });
    expect(reviewer).toBeInstanceOf(ClaudeReviewer);
    expect(reviewer.id).toBe("claude");
  });

  it("returns a CodexReviewer for codex cli config", () => {
    const reviewer = createReviewer("codex", { type: "cli", binary: "codex" });
    expect(reviewer).toBeInstanceOf(CodexReviewer);
    expect(reviewer.id).toBe("codex");
  });

  it("returns a GeminiReviewer for gemini cli config", () => {
    const reviewer = createReviewer("gemini", { type: "cli", binary: "gemini" });
    expect(reviewer).toBeInstanceOf(GeminiReviewer);
    expect(reviewer.id).toBe("gemini");
  });

  it("throws for unknown backend id (http without backend)", () => {
    expect(() =>
      createReviewer("some-llm", { type: "http", endpoint: "http://localhost:11434" }),
    ).toThrow(/explicit backend/i);
  });

  it("throws for unknown backend id (cli with unknown id)", () => {
    expect(() => createReviewer("unknown-llm", { type: "cli" })).toThrow(/not supported/i);
  });

  it("throws when cli config declares an HTTP-only backend", () => {
    expect(() =>
      createReviewer("myreviewer", { type: "cli", backend: "ollama" }),
    ).toThrow(/requires type "http"/i);
  });

  it("honors an explicit backend when id and binary are aliases", () => {
    const reviewer = createReviewer("primary", { type: "cli", backend: "claude", binary: "my-wrapper" });
    expect(reviewer).toBeInstanceOf(ClaudeReviewer);
    expect(reviewer.id).toBe("primary");
  });

  it("infers backend from the basename of an absolute binary path", () => {
    const reviewer = createReviewer("primary", { type: "cli", binary: "/usr/local/bin/claude" });
    expect(reviewer).toBeInstanceOf(ClaudeReviewer);
  });

  it("infers backend from binary before id for custom reviewer names", () => {
    const reviewer = createReviewer("my-claude", { type: "cli", binary: "claude" });
    expect(reviewer).toBeInstanceOf(ClaudeReviewer);
    expect(reviewer.id).toBe("my-claude");
  });

  it("rejects http reviewers without a known http backend", () => {
    expect(() =>
      createReviewer("myreviewer", { type: "http", endpoint: "http://localhost:11434" }),
    ).toThrow(/explicit backend/i);
  });

  it("returns an OllamaReviewer for ollama http config", () => {
    const reviewer = createReviewer("ollama", { type: "http", backend: "ollama", endpoint: "http://localhost:11434" });
    expect(reviewer).toBeInstanceOf(OllamaReviewer);
    expect(reviewer.id).toBe("ollama");
  });

  it("returns an OpenRouterReviewer for openrouter http config", () => {
    const reviewer = createReviewer("openrouter", {
      type: "http",
      backend: "openrouter",
      endpoint: "https://openrouter.ai/api/v1",
    });
    expect(reviewer).toBeInstanceOf(OpenRouterReviewer);
    expect(reviewer.id).toBe("openrouter");
  });

  it("returns a KimiReviewer for kimi cli config", () => {
    const reviewer = createReviewer("kimi", { type: "cli" });
    expect(reviewer).toBeInstanceOf(KimiReviewer);
    expect(reviewer.id).toBe("kimi");
  });

  it("returns a QwenReviewer for qwen cli config", () => {
    const reviewer = createReviewer("qwen", { type: "cli" });
    expect(reviewer).toBeInstanceOf(QwenReviewer);
    expect(reviewer.id).toBe("qwen");
  });
});

describe("createReviewer timeout wiring", () => {
  // timeoutMs is a TS-private constructor field; runtime access is fine in tests.
  const timeoutOf = (r: unknown): number => (r as { timeoutMs: number }).timeoutMs;
  const limits = { report_max_chars: 8000, timeout_seconds: 300 };

  it("prefers the reviewer's own timeout_seconds over limits", () => {
    const reviewer = createReviewer("codex", { type: "cli", timeout_seconds: 120 }, limits);
    expect(timeoutOf(reviewer)).toBe(120_000);
  });

  it("falls back to limits.timeout_seconds when the reviewer has none", () => {
    const reviewer = createReviewer("codex", { type: "cli" }, { ...limits, timeout_seconds: 90 });
    expect(timeoutOf(reviewer)).toBe(90_000);
  });

  it("defaults to 300s when neither reviewer nor limits provide a timeout", () => {
    const reviewer = createReviewer("codex", { type: "cli" });
    expect(timeoutOf(reviewer)).toBe(300_000);
  });

  it("wires the timeout into http reviewers too", () => {
    const reviewer = createReviewer("local", { type: "http", backend: "ollama", timeout_seconds: 45 }, limits);
    expect(timeoutOf(reviewer)).toBe(45_000);
  });
});

describe("runBackendJsonReview defensive guard", () => {
  it("throws when called with ollama backend (must use runHttpBackendJsonReview)", async () => {
    await expect(
      runBackendJsonReview({
        backend: "ollama",
        reviewerId: "ollama",
        config: { type: "http", backend: "ollama", endpoint: "http://localhost:11434" },
        systemPrompt: "s",
        userMessage: "u",
        timeoutMs: 5000,
        label: "Ollama",
      }),
    ).rejects.toThrow(/must use runHttpJsonReview/i);
  });

  it("throws when called with openrouter backend (must use runHttpBackendJsonReview)", async () => {
    await expect(
      runBackendJsonReview({
        backend: "openrouter",
        reviewerId: "openrouter",
        config: { type: "http", backend: "openrouter", endpoint: "https://openrouter.ai/api/v1" },
        systemPrompt: "s",
        userMessage: "u",
        timeoutMs: 5000,
        label: "OpenRouter",
      }),
    ).rejects.toThrow(/must use runHttpJsonReview/i);
  });
});
