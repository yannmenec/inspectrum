import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  ReviewPlanInputSchema,
  ReviewPlanOutputSchema,
  FindingSchema,
  ReviewPlanToolShape,
  ReviewPlanToolOutputShape,
} from "../../src/schemas.js";

vi.mock("../../src/tool/review-plan.js", () => ({
  reviewPlan: vi.fn(),
}));

import { reviewPlan } from "../../src/tool/review-plan.js";
import { createReviewPlanHandler } from "../../src/server/handlers.js";

const mockReviewPlan = vi.mocked(reviewPlan);

const FAKE_CONFIG = {
  version: 1,
  defaults: { reviewers: ["claude"], judge: "claude", focus: "all" as const },
  reviewers: { claude: { type: "cli" as const, binary: "claude" } },
  limits: { plan_max_chars: 16000, report_max_chars: 8000, timeout_seconds: 60 },
};

const CANNED_OUTPUT = {
  verdict: "approve" as const,
  report_markdown: "# inspectrum Review — session abcd1234\n\nApproved.",
  findings: [],
  session_id: "abcd1234",
  session_path: "/tmp/.inspectrum/sessions/2026-05-13T16-00-00__abcd1234",
};

describe("review_plan input contract", () => {
  it("accepts minimal valid input", () => {
    const result = ReviewPlanInputSchema.safeParse({ plan: "# Plan\nsome content" });
    expect(result.success).toBe(true);
  });

  it("rejects missing plan", () => {
    const result = ReviewPlanInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects plan exceeding 16000 chars with the canonical error message", () => {
    const result = ReviewPlanInputSchema.safeParse({ plan: "x".repeat(16001) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === "Plan exceeds 16 000 character limit")).toBe(true);
    }
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

  it("rejects context exceeding 8000 chars with the canonical error message", () => {
    const result = ReviewPlanInputSchema.safeParse({ plan: "# Plan", context: "x".repeat(8001) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === "Context exceeds 8 000 character limit")).toBe(true);
    }
  });

  it("accepts all focus values", () => {
    for (const focus of ["correctness", "completeness", "risk", "clarity", "all"] as const) {
      const result = ReviewPlanInputSchema.safeParse({ plan: "# Plan", focus });
      expect(result.success, `focus=${focus}`).toBe(true);
    }
  });
});

describe("review_plan output contract", () => {
  it("accepts valid approve output", () => {
    expect(ReviewPlanOutputSchema.safeParse(CANNED_OUTPUT).success).toBe(true);
  });

  it("accepts valid revise output with revised_plan", () => {
    const result = ReviewPlanOutputSchema.safeParse({
      ...CANNED_OUTPUT,
      verdict: "revise",
      revised_plan: "# Revised Plan\nFixed.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing verdict", () => {
    const { verdict: _, ...rest } = CANNED_OUTPUT;
    expect(ReviewPlanOutputSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid verdict", () => {
    expect(ReviewPlanOutputSchema.safeParse({ ...CANNED_OUTPUT, verdict: "maybe" }).success).toBe(false);
  });

  it("rejects missing session_id", () => {
    const { session_id: _, ...rest } = CANNED_OUTPUT;
    expect(ReviewPlanOutputSchema.safeParse(rest).success).toBe(false);
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

describe("MCP tool wiring (InMemoryTransport)", () => {
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    vi.resetAllMocks();
    server = new McpServer(
      { name: "inspectrum", version: "0.1.0" },
      { capabilities: { tools: {}, resources: {} } },
    );
    server.registerTool(
      "review_plan",
      {
        title: "Review Plan",
        description: "Test description",
        inputSchema: ReviewPlanToolShape,
        outputSchema: ReviewPlanToolOutputShape,
        annotations: {
          readOnlyHint: true,
          idempotentHint: false,
          destructiveHint: false,
          openWorldHint: true,
        },
      },
      createReviewPlanHandler(FAKE_CONFIG),
    );

    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("exposes exactly one tool named review_plan", async () => {
    const result = await client.listTools();
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0]!.name).toBe("review_plan");
  });

  it("publishes inputSchema with the expected properties", async () => {
    const result = await client.listTools();
    const props = result.tools[0]!.inputSchema.properties as Record<string, unknown>;
    expect(Object.keys(props).sort()).toEqual(["context", "focus", "judge", "plan", "reviewers"]);
  });

  it("publishes outputSchema with the expected properties", async () => {
    const result = await client.listTools();
    const outputSchema = result.tools[0]!.outputSchema as { properties: Record<string, unknown> } | undefined;
    expect(outputSchema).toBeDefined();
    const props = outputSchema!.properties;
    expect(Object.keys(props).sort()).toEqual([
      "findings",
      "report_markdown",
      "revised_plan",
      "session_id",
      "session_path",
      "verdict",
    ]);
  });

  it("returns both content (text) and structuredContent on successful call", async () => {
    mockReviewPlan.mockResolvedValue(CANNED_OUTPUT);
    const result = await client.callTool({
      name: "review_plan",
      arguments: { plan: "# Plan\nsome content" },
    });
    expect((result.content as Array<{ type: string }>)[0]!.type).toBe("text");
    expect(result.structuredContent).toBeDefined();
    expect(ReviewPlanOutputSchema.safeParse(result.structuredContent).success).toBe(true);
  });

  it("propagates revised_plan in structuredContent when present", async () => {
    mockReviewPlan.mockResolvedValue({ ...CANNED_OUTPUT, verdict: "revise", revised_plan: "# Revised" });
    const result = await client.callTool({
      name: "review_plan",
      arguments: { plan: "# Plan\nsome content" },
    });
    expect((result.structuredContent as Record<string, unknown>)["revised_plan"]).toBe("# Revised");
  });

  it("omits revised_plan from structuredContent when absent", async () => {
    mockReviewPlan.mockResolvedValue(CANNED_OUTPUT);
    const result = await client.callTool({
      name: "review_plan",
      arguments: { plan: "# Plan\nsome content" },
    });
    expect(result.structuredContent as Record<string, unknown>).not.toHaveProperty("revised_plan");
  });

  it("returns isError: true when reviewPlan throws", async () => {
    mockReviewPlan.mockRejectedValue(new Error("reviewers all failed"));
    const result = await client.callTool({
      name: "review_plan",
      arguments: { plan: "# Plan\nsome content" },
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]!.text).toContain("reviewers all failed");
  });
});
