import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

vi.mock("../../../src/tool/review-plan.js", () => ({
  reviewPlan: vi.fn(),
}));
vi.mock("../../../src/session/store.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/session/store.js")>(
    "../../../src/session/store.js",
  );
  return {
    ...actual,
    findSessionById: vi.fn(),
    readSessionFile: vi.fn(),
  };
});

import { reviewPlan } from "../../../src/tool/review-plan.js";
import { findSessionById, readSessionFile } from "../../../src/session/store.js";
import { createReviewPlanHandler, createSessionFileHandler } from "../../../src/server/handlers.js";

const mockReviewPlan = vi.mocked(reviewPlan);
const mockFindSessionById = vi.mocked(findSessionById);
const mockReadSessionFile = vi.mocked(readSessionFile);

const FAKE_CONFIG = {
  version: 1,
  defaults: { reviewers: ["claude"], judge: "claude", focus: "all" as const },
  reviewers: { claude: { type: "cli" as const, binary: "claude" } },
  limits: { report_max_chars: 8000, timeout_seconds: 60 },
};

const CANNED_OUTPUT = {
  verdict: "approve" as const,
  report_markdown: "# Report\nApproved.",
  findings: [],
  session_id: "abcd1234",
  session_path: "/tmp/.inspectrum/sessions/2026-05-13T16-00-00__abcd1234",
};

function fakeExtra(opts?: { progressToken?: string | number }) {
  const sendNotification = vi.fn().mockResolvedValue(undefined);
  return {
    extra: {
      _meta: opts?.progressToken !== undefined ? { progressToken: opts.progressToken } : undefined,
      sendNotification,
      signal: new AbortController().signal,
      requestId: "test-req",
      sendRequest: vi.fn(),
    } as never,
    sendNotification,
  };
}

describe("createReviewPlanHandler", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns content + structuredContent on success", async () => {
    mockReviewPlan.mockResolvedValue(CANNED_OUTPUT);
    const handler = createReviewPlanHandler(FAKE_CONFIG);
    const { extra } = fakeExtra();
    const result = await handler({ plan: "# P" } as never, extra);
    expect(result.content[0]!.type).toBe("text");
    expect(result.structuredContent).toMatchObject({
      verdict: "approve",
      session_id: "abcd1234",
    });
    expect(result.structuredContent).not.toHaveProperty("revised_plan");
  });

  it("includes revised_plan in structuredContent when reviewPlan returned one", async () => {
    mockReviewPlan.mockResolvedValue({ ...CANNED_OUTPUT, verdict: "revise", revised_plan: "# Revised" });
    const handler = createReviewPlanHandler(FAKE_CONFIG);
    const { extra } = fakeExtra();
    const result = await handler({ plan: "# P" } as never, extra);
    expect(result.structuredContent).toMatchObject({ revised_plan: "# Revised" });
  });

  it("emits notifications/progress when progressToken present", async () => {
    mockReviewPlan.mockImplementation(async (_p, _c, onProgress) => {
      await onProgress?.(1, 2, "halfway");
      return CANNED_OUTPUT;
    });
    const handler = createReviewPlanHandler(FAKE_CONFIG);
    const { extra, sendNotification } = fakeExtra({ progressToken: "tok-1" });
    await handler({ plan: "# P" } as never, extra);
    expect(sendNotification).toHaveBeenCalledWith({
      method: "notifications/progress",
      params: { progressToken: "tok-1", progress: 1, total: 2, message: "halfway" },
    });
  });

  it("does NOT emit progress when progressToken absent", async () => {
    mockReviewPlan.mockImplementation(async (_p, _c, onProgress) => {
      await onProgress?.(1, 2, "halfway");
      return CANNED_OUTPUT;
    });
    const handler = createReviewPlanHandler(FAKE_CONFIG);
    const { extra, sendNotification } = fakeExtra();
    await handler({ plan: "# P" } as never, extra);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("returns isError: true with the error message when reviewPlan throws", async () => {
    mockReviewPlan.mockRejectedValue(new Error("boom"));
    const handler = createReviewPlanHandler(FAKE_CONFIG);
    const { extra } = fakeExtra();
    const result = await handler({ plan: "# P" } as never, extra);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("boom");
  });

  it("stringifies non-Error thrown values", async () => {
    mockReviewPlan.mockRejectedValue("bare string");
    const handler = createReviewPlanHandler(FAKE_CONFIG);
    const { extra } = fakeExtra();
    const result = await handler({ plan: "# P" } as never, extra);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("bare string");
  });
});

describe("createSessionFileHandler", () => {
  beforeEach(() => vi.resetAllMocks());

  it("throws InvalidRequest when file not in allowlist", async () => {
    const handler = createSessionFileHandler();
    await expect(
      handler(
        new URL("inspectrum://sessions/abcd1234/secret.env"),
        { id: "abcd1234", file: "secret.env" },
        {} as never,
      ),
    ).rejects.toMatchObject({
      name: "McpError",
      code: ErrorCode.InvalidRequest,
    });
  });

  it("throws InvalidRequest when session id not found", async () => {
    mockFindSessionById.mockResolvedValue(null);
    const handler = createSessionFileHandler();
    await expect(
      handler(
        new URL("inspectrum://sessions/unknown/report.md"),
        { id: "unknown", file: "report.md" },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(McpError);
  });

  it("throws InvalidRequest when file not present in the session dir", async () => {
    mockFindSessionById.mockResolvedValue("/tmp/.inspectrum/sessions/test__abcd1234");
    mockReadSessionFile.mockResolvedValue(null);
    const handler = createSessionFileHandler();
    await expect(
      handler(
        new URL("inspectrum://sessions/abcd1234/report.md"),
        { id: "abcd1234", file: "report.md" },
        {} as never,
      ),
    ).rejects.toBeInstanceOf(McpError);
  });

  it("returns contents with correct mime type on success", async () => {
    mockFindSessionById.mockResolvedValue("/tmp/.inspectrum/sessions/test__abcd1234");
    mockReadSessionFile.mockResolvedValue("# Report content");
    const handler = createSessionFileHandler();
    const result = await handler(
      new URL("inspectrum://sessions/abcd1234/report.md"),
      { id: "abcd1234", file: "report.md" },
      {} as never,
    );
    expect(result.contents[0]!.text).toBe("# Report content");
    expect(result.contents[0]!.mimeType).toBe("text/markdown");
    expect(result.contents[0]!.uri).toBe("inspectrum://sessions/abcd1234/report.md");
  });

  it("returns application/json mime type for session.json", async () => {
    mockFindSessionById.mockResolvedValue("/tmp/.inspectrum/sessions/test__abcd1234");
    mockReadSessionFile.mockResolvedValue('{"id":"abcd"}');
    const handler = createSessionFileHandler();
    const result = await handler(
      new URL("inspectrum://sessions/abcd1234/session.json"),
      { id: "abcd1234", file: "session.json" },
      {} as never,
    );
    expect(result.contents[0]!.mimeType).toBe("application/json");
  });
});
