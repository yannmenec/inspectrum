import type { SessionEntry } from "./store.js";

export const SESSION_RESOURCE_FILES = [
  "plan-input.md",
  "report.md",
  "revised-plan.md",
  "session.json",
  "judge.md",
] as const;

export type SessionResourceFile = (typeof SESSION_RESOURCE_FILES)[number];

export function isSessionResourceFile(file: string): file is SessionResourceFile {
  return (SESSION_RESOURCE_FILES as readonly string[]).includes(file);
}

export function sessionFileMimeType(file: string): "application/json" | "text/markdown" {
  return file.endsWith(".json") ? "application/json" : "text/markdown";
}

export function buildSessionsIndex(sessions: SessionEntry[]): string {
  return JSON.stringify(
    {
      sessions: sessions.map((session) => ({
        ...session,
        resources: SESSION_RESOURCE_FILES.map((file) => ({
          file,
          uri: `inspectrum://sessions/${session.id}/${file}`,
          mimeType: sessionFileMimeType(file),
        })),
      })),
    },
    null,
    2,
  );
}
