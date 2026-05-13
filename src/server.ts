import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { listSessions } from "./session/store.js";
import { buildSessionsIndex } from "./session/resources.js";
import {
  ReviewPlanToolShape,
  ReviewPlanToolOutputShape,
} from "./schemas.js";
import {
  createReviewPlanHandler,
  createSessionFileHandler,
  sessionFileTemplate,
} from "./server/handlers.js";

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
    inputSchema: ReviewPlanToolShape,
    outputSchema: ReviewPlanToolOutputShape,
    annotations: {
      readOnlyHint: true,
      idempotentHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  createReviewPlanHandler(config),
);

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

server.resource("session-file", sessionFileTemplate, createSessionFileHandler());

const transport = new StdioServerTransport();
await server.connect(transport);
