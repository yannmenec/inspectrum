import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, readdir, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { RawReview } from "../schemas.js";

export interface SessionData {
  id: string;
  started_at: string;
  duration_ms: number;
  reviewers: string[];
  judge: string;
  judge_status?: "success" | "fallback" | "skipped";
  judge_error?: string;
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
  judgeReview?: RawReview;
  baseDir?: string;
}

export interface WriteSessionResult {
  sessionPath: string;
}

export interface SessionEntry {
  id: string;
  path: string;
  startedAt: string;
}

export function defaultSessionsDir(): string {
  return join(homedir(), ".inspectrum", "sessions");
}

export async function writeSession(opts: WriteSessionOptions): Promise<WriteSessionResult> {
  const baseDir = opts.baseDir ?? defaultSessionsDir();
  for (const id of Object.keys(opts.reviews)) {
    assertSafeReviewerId(id);
  }

  const timestamp = formatTimestampForDir(opts.session.started_at);
  const dirName = `${timestamp}__${opts.session.id}`;
  const sessionPath = join(baseDir, dirName);
  const tmpPath = join(baseDir, `${dirName}.tmp-${randomUUID()}`);

  await mkdir(baseDir, { recursive: true });
  await mkdir(tmpPath);

  try {
    const judgeContent = opts.judgeReview ? formatRawReview(opts.judgeReview) : null;

    await Promise.all([
      writeFile(join(tmpPath, "plan-input.md"), opts.planInput, "utf8"),
      writeFile(join(tmpPath, "report.md"), opts.report, "utf8"),
      writeFile(join(tmpPath, "session.json"), JSON.stringify(opts.session, null, 2), "utf8"),
      ...Object.entries(opts.reviews).map(([id, content]) =>
        writeFile(join(tmpPath, `review-${id}.md`), content, "utf8"),
      ),
      opts.revisedPlan
        ? writeFile(join(tmpPath, "revised-plan.md"), opts.revisedPlan, "utf8")
        : Promise.resolve(),
      judgeContent ? writeFile(join(tmpPath, "judge.md"), judgeContent, "utf8") : Promise.resolve(),
    ]);

    await rename(tmpPath, sessionPath);
  } catch (err) {
    await rm(tmpPath, { recursive: true, force: true }).catch(() => {});
    throw err;
  }

  return { sessionPath };
}

export async function readSessionFile(sessionPath: string, filename: string): Promise<string | null> {
  const basePath = resolve(sessionPath);
  const filePath = resolve(basePath, filename);
  if (filePath !== basePath && !filePath.startsWith(basePath + sep)) return null;
  if (!existsSync(filePath)) return null;
  return readFile(filePath, "utf8");
}

export async function listSessions(baseDir?: string): Promise<SessionEntry[]> {
  const dir = baseDir ?? defaultSessionsDir();

  if (!existsSync(dir)) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const sessions: SessionEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // Expected format: 2024-01-15T10-30-00__abc12345
    const match = entry.name.match(/^(.+)__([a-f0-9]{8})$/);
    if (!match) continue;
    const [, timestamp, id] = match;
    sessions.push({
      id: id!,
      path: join(dir, entry.name),
      startedAt: timestamp!.replace(/T(\d{2})-(\d{2})-(\d{2})$/, "T$1:$2:$3Z"),
    });
  }

  // Sort by directory name descending (timestamp prefix ensures recency order)
  sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return sessions;
}

function formatTimestampForDir(startedAt: string): string {
  return startedAt.replace(/:/g, "-").replace(/\.\d{3}Z$/, "");
}

function assertSafeReviewerId(id: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid reviewer id for session filename: ${id}`);
  }
}

export async function findSessionById(id: string, baseDir?: string): Promise<string | null> {
  const dir = baseDir ?? defaultSessionsDir();

  if (!existsSync(dir)) return null;

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.endsWith(`__${id}`)) {
      return join(dir, entry.name);
    }
  }

  return null;
}

function formatRawReview(r: RawReview): string {
  const lines = [
    `# Judge Review`,
    "",
    `**Verdict:** ${r.verdict}`,
    "",
  ];
  if (r.summary) lines.push(r.summary, "");
  for (const f of r.findings) {
    lines.push(`- [${f.severity}/${f.category}] ${f.message}`);
    if (f.suggested_fix) lines.push(`  Fix: ${f.suggested_fix}`);
  }
  return lines.join("\n");
}
