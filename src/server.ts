import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { reviewPlan } from "./tool/review-plan.js";
import { listSessions, findSessionById, readSessionFile } from "./session/store.js";
import { buildSessionsIndex, isSessionResourceFile, sessionFileMimeType, SESSION_RESOURCE_FILES } from "./session/resources.js";

const server = new McpServer(
  { name: "inspectrum", version: "0.1.0" },
  { capabilities: { tools: {}, resources: {} } },
);

const config = loadConfig();

server.registerTool(
  "review_plan",
  {
    title: "Review Plan",
    description:
      "Review a development/architecture plan with peer LLMs and return a consolidated verdict " +
      "(approve | revise | reject) with prioritized findings. " +
      "Read-only, writes a session log to ~/.inspectrum/sessions/.",
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
  async (params, extra) => {
    try {
      // _meta is the MCP SDK's escape hatch for client-sent metadata not yet in the typed API
      const progressToken = extra._meta?.progressToken;
      const onProgress = async (progress: number, total: number, message: string): Promise<void> => {
        if (progressToken === undefined) return;
        await extra.sendNotification({
          method: "notifications/progress",
          params: { progressToken, progress, total, message },
        });
      };
      const result = await reviewPlan(params, config, onProgress);

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

// Resource: list all sessions
server.resource("sessions", "inspectrum://sessions", async () => {
  const sessions = await listSessions();
  return {
    contents: [{
      uri: "inspectrum://sessions",
      text: buildSessionsIndex(sessions),
      mimeType: "application/json",
    }],
  };
});

// Resource template: individual session file
server.resource(
  "session-file",
  // The SDK requires the list property to be present; undefined makes this template non-listing.
  new ResourceTemplate("inspectrum://sessions/{id}/{file}", { list: undefined }),
  async (uri, { id, file }) => {
    const fileStr = String(file);
    if (!isSessionResourceFile(fileStr)) {
      throw new McpError(ErrorCode.InvalidRequest, `Invalid file: ${fileStr}. Allowed: ${SESSION_RESOURCE_FILES.join(", ")}`);
    }

    const sessionPath = await findSessionById(String(id));
    if (!sessionPath) {
      throw new McpError(ErrorCode.InvalidRequest, `Session ${id} not found`);
    }

    const content = await readSessionFile(sessionPath, fileStr);
    if (content === null) {
      throw new McpError(ErrorCode.InvalidRequest, `File not found: ${fileStr}`);
    }

    return {
      contents: [
        {
          uri: uri.href,
          text: content,
          mimeType: sessionFileMimeType(fileStr),
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
