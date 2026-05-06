import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface SessionData {
  id: string;
  started_at: string;
  duration_ms: number;
  reviewers: string[];
  judge: string;
  verdict: "approve" | "revise" | "reject";
  counts: { blocker: number; major: number; minor: number; nit: number };
  plan_chars: number;
  report_chars: number;
}

export interface WriteSessionOptions {
  session: SessionData;
  planInput: string;
  reviews: Record<string, string>;
  report: string;
  revisedPlan?: string;
  baseDir?: string;
}

export interface WriteSessionResult {
  sessionPath: string;
}

export function defaultSessionsDir(): string {
  return join(homedir(), ".inspectrum", "sessions");
}

export async function writeSession(opts: WriteSessionOptions): Promise<WriteSessionResult> {
  const baseDir = opts.baseDir ?? defaultSessionsDir();
  const timestamp = opts.session.started_at.replace(/:/g, "-").replace(/\..+$/, "");
  const dirName = `${timestamp}__${opts.session.id}`;
  const sessionPath = join(baseDir, dirName);

  await mkdir(sessionPath, { recursive: true });

  await Promise.all([
    writeFile(join(sessionPath, "plan-input.md"), opts.planInput, "utf8"),
    writeFile(join(sessionPath, "report.md"), opts.report, "utf8"),
    writeFile(join(sessionPath, "session.json"), JSON.stringify(opts.session, null, 2), "utf8"),
    ...Object.entries(opts.reviews).map(([id, content]) =>
      writeFile(join(sessionPath, `review-${id}.md`), content, "utf8"),
    ),
    opts.revisedPlan
      ? writeFile(join(sessionPath, "revised-plan.md"), opts.revisedPlan, "utf8")
      : Promise.resolve(),
  ]);

  return { sessionPath };
}

export async function readSessionFile(sessionPath: string, filename: string): Promise<string | null> {
  const filePath = join(sessionPath, filename);
  if (!existsSync(filePath)) return null;
  return readFile(filePath, "utf8");
}
