import {
  ResourceTemplate,
  type ToolCallback,
  type ReadResourceTemplateCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { reviewPlan } from "../tool/review-plan.js";
import { findSessionById, readSessionFile } from "../session/store.js";
import { isSessionResourceFile, sessionFileMimeType, SESSION_RESOURCE_FILES } from "../session/resources.js";
import { ReviewPlanToolShape } from "../schemas.js";
import type { Config } from "../config.js";

/**
 * Tool callback for review_plan, extracted from server.ts so it can be unit-tested
 * without spinning up a stdio transport.
 *
 * Returns both `content` (text + fenced JSON for hosts that don't grok structured
 * output) and `structuredContent` (validated against ReviewPlanOutputSchema by
 * the SDK). The revised_plan key is conditionally spread to avoid an `undefined`
 * leaking into structuredContent — the SDK's strict validator rejects undefined
 * on optional-omitted fields.
 */
export function createReviewPlanHandler(config: Config): ToolCallback<typeof ReviewPlanToolShape> {
  return async (params, extra) => {
    try {
      // _meta is the MCP SDK's escape hatch for client-sent metadata not yet in the typed API
      const progressToken = (extra._meta as { progressToken?: string | number } | undefined)?.progressToken;
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
        structuredContent: {
          verdict: result.verdict,
          report_markdown: result.report_markdown,
          findings: result.findings,
          ...(result.revised_plan ? { revised_plan: result.revised_plan } : {}),
          session_id: result.session_id,
          session_path: result.session_path,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `inspectrum error: ${message}` }],
        isError: true,
      };
    }
  };
}

/**
 * Resource-template handler for inspectrum://sessions/{id}/{file}. Extracted
 * from server.ts so the three throw branches (invalid file, unknown session,
 * file not found) are unit-testable.
 */
export function createSessionFileHandler(): ReadResourceTemplateCallback {
  return async (uri, vars) => {
    const fileStr = String(vars["file"]);
    if (!isSessionResourceFile(fileStr)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid file: ${fileStr}. Allowed: ${SESSION_RESOURCE_FILES.join(", ")}`,
      );
    }

    const sessionPath = await findSessionById(String(vars["id"]));
    if (!sessionPath) {
      throw new McpError(ErrorCode.InvalidRequest, `Session ${vars["id"]} not found`);
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
  };
}

export const sessionFileTemplate = new ResourceTemplate(
  "inspectrum://sessions/{id}/{file}",
  // The SDK requires `list` to be present; `undefined` makes this template non-listing.
  { list: undefined },
);
