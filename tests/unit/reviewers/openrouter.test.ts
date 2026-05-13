import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenRouterReviewer } from "../../../src/reviewers/openrouter.js";
import type { ReviewerConfig } from "../../../src/schemas.js";

const cfg: ReviewerConfig = {
  type: "http",
  backend: "openrouter",
  endpoint: "https://openrouter.ai/api/v1",
};

const validRawReview = {
  verdict: "revise",
  findings: [
    {
      severity: "major",
      category: "risk",
      reviewer: "openrouter",
      message: "Missing error handling.",
    },
  ],
  summary: "Needs error handling.",
};

const validRawReviewNoFindings = {
  verdict: "approve",
  findings: [],
  summary: "All good.",
};

function makeOkResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
    text: () => Promise.resolve(content),
  };
}

function mockFetchOk(content: string): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeOkResponse(content)));
}

function mockFetchStatus(status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      text: () => Promise.resolve("error from server"),
    }),
  );
}

function mockFetchReject(err: Error): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(err));
}

beforeEach(() => {
  vi.unstubAllGlobals();
  delete process.env["OPENROUTER_API_KEY"];
});

describe("OpenRouterReviewer", () => {
  it("returns a parsed RawReview on success", async () => {
    mockFetchOk(JSON.stringify(validRawReview));
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    const result = await reviewer.review("# Plan\ncontent", "all");
    expect(result.verdict).toBe("revise");
    expect(result.reviewer).toBe("openrouter");
    expect(result.findings).toHaveLength(1);
  });

  it("normalizes top-level reviewer field to wrapper id", async () => {
    const review = { ...validRawReview, reviewer: "model-said-this" };
    mockFetchOk(JSON.stringify(review));
    const reviewer = new OpenRouterReviewer("my-openrouter", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.reviewer).toBe("my-openrouter");
  });

  it("normalizes findings[].reviewer to wrapper id", async () => {
    const review = {
      ...validRawReview,
      findings: [{ ...validRawReview.findings[0]!, reviewer: "model-said-this" }],
    };
    mockFetchOk(JSON.stringify(review));
    const reviewer = new OpenRouterReviewer("my-openrouter", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.findings[0]!.reviewer).toBe("my-openrouter");
  });

  it("strips markdown code fences from choices[0].message.content", async () => {
    const fenced = "```json\n" + JSON.stringify(validRawReview) + "\n```";
    mockFetchOk(fenced);
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    const result = await reviewer.review("# Plan", "all");
    expect(result.verdict).toBe("revise");
  });

  it("throws on HTTP 401 (unauthorized)", async () => {
    mockFetchStatus(401);
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/HTTP 401/i);
  });

  it("throws on HTTP 500", async () => {
    mockFetchStatus(500);
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/HTTP 500/i);
  });

  it("throws when fetch is rejected (network error)", async () => {
    mockFetchReject(new Error("ECONNREFUSED"));
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
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
    const reviewer = new OpenRouterReviewer("openrouter", cfg, 50);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/request failed/i);
  }, 2000);

  it("throws when response JSON is missing choices array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ unexpected: "shape" }),
        text: () => Promise.resolve(""),
      }),
    );
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/missing expected shape/i);
  });

  it("throws when choices array is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ choices: [] }),
        text: () => Promise.resolve(""),
      }),
    );
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/missing expected shape/i);
  });

  it("throws when choices[0].message.content fails RawReviewSchema", async () => {
    mockFetchOk(JSON.stringify({ verdict: "maybe", findings: "not-array" }));
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
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
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    await expect(reviewer.review("# Plan", "all")).rejects.toThrow(/non-JSON/i);
  });

  it("truncates plan at 16000 chars before sending", async () => {
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    const longPlan = "x".repeat(20_000);
    await reviewer.review(longPlan, "all");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string) as { messages: { content: string }[] };
    const userContent = body.messages[1]!.content;
    expect(userContent).toContain("[...truncated]");
    expect(userContent.length).toBeLessThan(17_000);
  });

  it("uses default model anthropic/claude-sonnet-4-6 when config.model is absent", async () => {
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    await reviewer.review("# Plan", "all");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string) as { model: string };
    expect(body.model).toBe("anthropic/claude-sonnet-4-6");
  });

  it("uses config.model when provided", async () => {
    const cfgWithModel: ReviewerConfig = { ...cfg, model: "google/gemini-2.5-pro" };
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OpenRouterReviewer("openrouter", cfgWithModel);
    await reviewer.review("# Plan", "all");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string) as { model: string };
    expect(body.model).toBe("google/gemini-2.5-pro");
  });

  it("sends Authorization: Bearer header from OPENROUTER_API_KEY env var", async () => {
    process.env["OPENROUTER_API_KEY"] = "test-key-123";
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    await reviewer.review("# Plan", "all");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-key-123");
  });

  it("omits Authorization header when OPENROUTER_API_KEY is not set", async () => {
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    await reviewer.review("# Plan", "all");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("omits Authorization header when OPENROUTER_API_KEY is empty string", async () => {
    process.env["OPENROUTER_API_KEY"] = "";
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    await reviewer.review("# Plan", "all");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("sends HTTP-Referer and X-Title headers", async () => {
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    await reviewer.review("# Plan", "all");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const headers = (fetchCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers["HTTP-Referer"]).toBe("https://github.com/yannmenec/inspectrum");
    expect(headers["X-Title"]).toBe("inspectrum");
  });

  it("appends /chat/completions to endpoint", async () => {
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    await reviewer.review("# Plan", "all");
    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("strips trailing slash from endpoint before appending /chat/completions", async () => {
    const cfgTrailing: ReviewerConfig = { ...cfg, endpoint: "https://openrouter.ai/api/v1/" };
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OpenRouterReviewer("openrouter", cfgTrailing);
    await reviewer.review("# Plan", "all");
    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("does not send format field in body", async () => {
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    await reviewer.review("# Plan", "all");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body["format"]).toBeUndefined();
  });

  it("sends stream: false in body", async () => {
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    await reviewer.review("# Plan", "all");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string) as { stream: boolean };
    expect(body.stream).toBe(false);
  });

  it("includes context in the user message when provided", async () => {
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OpenRouterReviewer("openrouter", cfg);
    await reviewer.review("# Plan", "all", "some codebase context");
    const fetchCall = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string) as { messages: { content: string }[] };
    const userContent = body.messages[1]!.content;
    expect(userContent).toContain("CODEBASE CONTEXT:");
    expect(userContent).toContain("some codebase context");
  });

  it("uses config.endpoint as base URL", async () => {
    const cfgCustom: ReviewerConfig = { ...cfg, endpoint: "https://my-proxy.example.com/openrouter/v1" };
    mockFetchOk(JSON.stringify(validRawReviewNoFindings));
    const reviewer = new OpenRouterReviewer("openrouter", cfgCustom);
    await reviewer.review("# Plan", "all");
    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toBe("https://my-proxy.example.com/openrouter/v1/chat/completions");
  });
});
