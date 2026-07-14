import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { getPackageVersion } from "./version.js";
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
  { name: "inspectrum", version: getPackageVersion() },
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
      "Runs configured reviewer CLIs and writes a local session log to ~/.inspectrum/sessions/.",
    inputSchema: ReviewPlanToolShape,
    outputSchema: ReviewPlanToolOutputShape,
    annotations: {
      readOnlyHint: false,
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
