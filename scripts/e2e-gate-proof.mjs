import { accessSync, constants, realpathSync } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { basename, delimiter, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

export function findConfiguredCodexReviewers(config, resolveBackend) {
  const activeIds = config.plan_gate?.reviewers
    ?? config.defaults?.reviewers
    ?? [];

  return activeIds.flatMap((id) => {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) return [];
    const reviewer = config.reviewers?.[id];
    if (!reviewer || basename(reviewer.binary ?? "codex") !== "codex") {
      return [];
    }
    try {
      return resolveBackend(id, reviewer) === "codex"
        ? [{ id, binary: reviewer.binary ?? "codex" }]
        : [];
    } catch {
      return [];
    }
  });
}

export function resolveExecutablePath(binary, pathValue = process.env.PATH ?? "") {
  const candidates = binary.includes("/")
    ? [binary]
    : pathValue.split(delimiter).map((dir) => join(dir || ".", binary));
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch {
      // Try the next PATH entry.
    }
  }
  throw new Error(`Executable not found: ${binary}`);
}

export async function findRealCodexProofs({
  sessionsDir,
  markerPath,
  runToken,
  reviewerIds,
}) {
  const marker = await stat(markerPath);
  let entries;
  try {
    entries = await readdir(sessionsDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const proofs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionDir = join(sessionsDir, entry.name);

    try {
      const sessionStat = await stat(sessionDir);
      if (sessionStat.mtimeMs < marker.mtimeMs) continue;

      const [plan, sessionJson] = await Promise.all([
        readFile(join(sessionDir, "plan-input.md"), "utf8"),
        readFile(join(sessionDir, "session.json"), "utf8"),
      ]);
      if (!plan.includes(runToken)) continue;

      const session = JSON.parse(sessionJson);
      if (!Array.isArray(session.reviewers)) {
        continue;
      }

      for (const reviewerId of reviewerIds) {
        if (!session.reviewers.includes(reviewerId)) continue;
        const reviewPath = join(sessionDir, `review-${reviewerId}.md`);
        await access(reviewPath);
        if ((await readFile(reviewPath, "utf8")).trim().length > 0) {
          proofs.push(sessionDir);
          break;
        }
      }
    } catch {
      // Incomplete, corrupt, or concurrently written sessions are not proof.
    }
  }

  return proofs.sort();
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const [sessionsDir, markerPath, runToken, reviewerIdsPath] =
    process.argv.slice(2);
  if (!sessionsDir || !markerPath || !runToken || !reviewerIdsPath) {
    process.stderr.write(
      "Usage: node scripts/e2e-gate-proof.mjs <sessions-dir> <marker> <run-token> <reviewer-ids-file>\n",
    );
    process.exitCode = 2;
  } else {
    try {
      const configuredReviewers = JSON.parse(
        await readFile(reviewerIdsPath, "utf8"),
      );
      const reviewerIds = configuredReviewers.map((reviewer) => reviewer.id);
      const proofs = await findRealCodexProofs({
        sessionsDir,
        markerPath,
        runToken,
        reviewerIds,
      });
      if (proofs.length > 0) {
        process.stdout.write(`${proofs.join("\n")}\n`);
      }
    } catch (error) {
      process.stderr.write(
        `Unable to verify real Codex review sessions: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    }
  }
}
