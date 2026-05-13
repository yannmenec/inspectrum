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

  it("throws for unknown backend id", () => {
    expect(() =>
      createReviewer("some-llm", { type: "http", endpoint: "http://localhost:11434" }),
    ).toThrow(/explicit backend/i);
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
