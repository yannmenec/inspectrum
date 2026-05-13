import { describe, it, expect, vi, beforeEach } from "vitest";
import { OllamaReviewer } from "../../../src/reviewers/ollama.js";
import type { ReviewerConfig } from "../../../src/schemas.js";

const cfg: ReviewerConfig = { type: "http", backend: "ollama", endpoint: "http://localhost:11434" };

const validRawReview = {
  verdict: "approve",
  findings: [
    {
      severity: "minor",
      category: "clarity",
      reviewer: "ollama",
      message: "Consider renaming variable.",
    },
  ],
  summary: "Mostly fine.",
};

const validRawReviewNoFindings = {
  verdict: "approve",
  findings: [],
  summary: "All good.",
};

function mockFetchOk(content: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ message: { content } }),
      text: () => Promise.resolve(content),
    }),
  );
}

function mockFetchStatus(status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      text: () => Promise.resolve("error body from server"),
    }),
  );
}

function mockFetchReject(err: Error): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(err));
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("OllamaReviewer", () => {
  it("returns a parsed RawReview on success", async () => {
    mockFetchOk(JSON.stringify(validRawReview));
    const reviewer = new OllamaReviewer("ollama", cfg);
    const result = await reviewer.review("# Plan\ncontent", "all");
    expect(result.verdict).toBe("approve");
    expect(result.reviewer).toBe("ollama");
    expect(result.findings).toHaveLength(1);
  });

  it("normalizes top-level reviewer field to wrapper id", async () => {
    const reviewWithWrongId = { ...validRawReview, reviewer: "model-said-this" };
    mockFetchOk(JSON.stringify(reviewWithWrongId));
    const reviewer = new OllamaReviewer("my-ollama", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.reviewer).toBe("my-ollama");
  });

  it("normalizes findings[].reviewer to wrapper id", async () => {
    const review = {
      ...validRawReview,
      findings: [{ ...validRawReview.findings[0]!, reviewer: "model-said-this" }],
    };
    mockFetchOk(JSON.stringify(review));
    const reviewer = new OllamaReviewer("my-ollama", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.findings[0]!.reviewer).toBe("my-ollama");
  });

  it("strips markdown code fences from message.content before parsing", async () => {
    const fenced = "```json\n" + JSON.stringify(validRawReview) + "\n```";
    mockFetchOk(fenced);
    const reviewer = new OllamaReviewer("ollama", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.verdict).toBe("approve");
  });

  it("throws on HTTP 500", async () => {
    mockFetchStatus(500);
    const reviewer = new OllamaReviewer("ollama", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/HTTP 500/i);
  });

  it("throws on HTTP 401", async () => {
    mockFetchStatus(401);
    const reviewer = new OllamaReviewer("ollama", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/HTTP 401/i);
  });

  it("throws when fetch is rejected (network error)", async () => {
    mockFetchReject(new Error("ECONNREFUSED"));
    const reviewer = new OllamaReviewer("ollama", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/request failed/i);
  });

  it("throws on timeout (AbortController fires)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
        return new Promise((_resolve, reject) => {
          (opts.signal as AbortSignal).addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }),
    );
    const reviewer = new OllamaReviewer("ollama", cfg, 50);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/request failed/i);
  }, 2000);

  it("throws when response JSON is missing message.content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ unexpected: "shape" }),
        text: () => Promise.resolve(""),
      }),
    );
    const reviewer = new OllamaReviewer("ollama", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/missing expected shape/i);
  });

  it("throws when message.content fails RawReviewSchema", async () => {
    mockFetchOk(JSON.stringify({ verdict: "maybe", findings: "not an array" }));
    const reviewer = new OllamaReviewer("ollama", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/schema validation/i);
  });

  it("throws when response body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
        text: () => Promise.resolve("not json"),
      }),
    );
    const reviewer = new OllamaReviewer("ollama", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/non-JSON/i);
  });

  it("truncates plan at 16000 chars before sending", async () => {
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OllamaReviewer("ollama", cfg);
    const longPlan = "x".repeat(20_000);
    await reviewer.review(longPlan, "all");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string) as { messages: { content: string }[] };
    const userContent = body.messages[1]!.content;
    expect(userContent).toContain("[...truncated]");
    expect(userContent.length).toBeLessThan(17_000);
  });

  it("uses default model qwen2.5:0.5b when config.model is absent", async () => {
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OllamaReviewer("ollama", cfg);
    await reviewer.review("# Plan", "all");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string) as { model: string };
    expect(body.model).toBe("qwen2.5:0.5b");
  });

  it("uses config.model when provided", async () => {
    const cfgWithModel: ReviewerConfig = { ...cfg, model: "llama3.2:3b" };
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OllamaReviewer("ollama", cfgWithModel);
    await reviewer.review("# Plan", "all");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string) as { model: string };
    expect(body.model).toBe("llama3.2:3b");
  });

  it("uses config.endpoint as base URL", async () => {
    const cfgCustom: ReviewerConfig = { type: "http", backend: "ollama", endpoint: "http://192.168.1.10:11434" };
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OllamaReviewer("ollama", cfgCustom);
    await reviewer.review("# Plan", "all");
    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toBe("http://192.168.1.10:11434/api/chat");
  });

  it("strips trailing slash from endpoint before appending /api/chat", async () => {
    const cfgTrailing: ReviewerConfig = { type: "http", backend: "ollama", endpoint: "http://localhost:11434/" };
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OllamaReviewer("ollama", cfgTrailing);
    await reviewer.review("# Plan", "all");
    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toBe("http://localhost:11434/api/chat");
  });

  it("does not send an Authorization header", async () => {
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OllamaReviewer("ollama", cfg);
    await reviewer.review("# Plan", "all");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("sends Content-Type: application/json header", async () => {
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OllamaReviewer("ollama", cfg);
    await reviewer.review("# Plan", "all");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sends stream: false and format: json in body", async () => {
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OllamaReviewer("ollama", cfg);
    await reviewer.review("# Plan", "all");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string) as { stream: boolean; format: string };
    expect(body.stream).toBe(false);
    expect(body.format).toBe("json");
  });

  it("includes context in the system/user message when provided", async () => {
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OllamaReviewer("ollama", cfg);
    await reviewer.review("# Plan", "all", "some codebase context");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string) as { messages: { content: string }[] };
    const userContent = body.messages[1]!.content;
    expect(userContent).toContain("CODEBASE CONTEXT:");
    expect(userContent).toContain("some codebase context");
  });
});
