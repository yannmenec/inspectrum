import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { reviewPlan } from "./tool/review-plan.js";

const server = new McpServer(
  { name: "inspectrum", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

const config = loadConfig();

server.registerTool(
  "review_plan",
  {
    title: "Review Plan",
    description:
      "Review a development/architecture plan with peer LLMs and return a consolidated verdict " +
      "(approve | revise | reject) with prioritized findings. " +
      "Writes a session log to ~/.inspectrum/sessions/.",
    inputSchema: {
      plan: z
        .string()
        .max(16000)
        .describe("The plan to review, in Markdown. Max 16 000 characters."),
      reviewers: z
        .array(z.string())
        .optional()
        .describe("Reviewer IDs (from config). Defaults to config defaults.reviewers."),
      focus: z
        .enum(["correctness", "completeness", "risk", "clarity", "all"])
        .default("all")
        .describe("Review focus area."),
      judge: z
        .boolean()
        .default(true)
        .describe("Run judge agent to consolidate when >= 2 reviewers."),
      context: z
        .string()
        .max(8000)
        .optional()
        .describe("Optional codebase excerpts for context. Max 8 000 characters."),
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  async (params) => {
    try {
      const result = await reviewPlan(params, config);

      const jsonBlock = [
        "",
        "---",
        "```json",
        JSON.stringify(
          {
            session_id: result.session_id,
            session_path: result.session_path,
            verdict: result.verdict,
            findings: result.findings,
            ...(result.revised_plan ? { revised_plan: result.revised_plan } : {}),
          },
          null,
          2,
        ),
        "```",
      ].join("\n");

      return {
        content: [{ type: "text", text: result.report_markdown + jsonBlock }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `inspectrum error: ${message}` }],
        isError: true,
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
