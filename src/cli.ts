#!/usr/bin/env node
import { getPackageVersion } from "./version.js";

const command = process.argv[2];

if (command === "--version" || command === "-v") {
  process.stdout.write(`${getPackageVersion()}\n`);
  process.exit(0);
} else if (command === "--help" || command === "-h") {
  process.stdout.write(
    [
      "inspectrum — multi-LLM plan review MCP server",
      "",
      "Usage:",
      "  inspectrum               start the MCP server on stdio (default)",
      "  inspectrum doctor        check Node, config, sessions dir, and reviewer CLIs",
      "  inspectrum plan-gate     Claude Code PreToolUse hook (ExitPlanMode); hook JSON on stdin",
      "  inspectrum --version     print version",
      "  inspectrum --help        print this help",
      "",
      "Config: ~/.inspectrum/config.toml (optional; defaults to reviewers=[\"codex\"])",
      "Docs:   https://github.com/yannmenec/inspectrum",
      "",
    ].join("\n"),
  );
  process.exit(0);
} else if (command === "doctor") {
  const { runDoctor } = await import("./doctor.js");
  const ok = await runDoctor();
  process.exit(ok ? 0 : 1);
} else if (command === "plan-gate") {
  // Always exit 0: a nonzero exit would surface as a hook error in Claude
  // Code; the gate's contract is to fail open with a JSON systemMessage.
  let out: string;
  try {
    const { readFileSync } = await import("node:fs");
    const { loadConfig } = await import("./config.js");
    const { runPlanGate } = await import("./hook/plan-gate.js");
    out = await runPlanGate(readFileSync(0, "utf8"), loadConfig());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    out = JSON.stringify({ systemMessage: `inspectrum plan-gate skipped: ${msg}. Plan proceeds unreviewed.` });
  }
  process.stdout.write(out);
  process.exit(0);
} else {
  await import("./server.js");
}
