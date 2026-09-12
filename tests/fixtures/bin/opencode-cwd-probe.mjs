#!/usr/bin/env node
// Real-child fixture for the OpenCode cwd/env pinning regression (issue-110).
// Reports where it actually ran, then emits a valid RawReview on stdout so the
// caller's normal parsing path exercises unchanged.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const dirFlagIdx = args.findIndex((a) => a === "--dir" || a === "-dir");
let selectedDir;
if (dirFlagIdx !== -1 && args[dirFlagIdx + 1] !== undefined) {
  selectedDir = resolve(args[dirFlagIdx + 1]);
} else {
  const inlineDir = args.find((a) => a.startsWith("--dir="));
  selectedDir = inlineDir ? resolve(inlineDir.slice("--dir=".length)) : resolve(process.env.PWD ?? process.cwd());
}

let stdin = "";
process.stdin.on("data", (d) => {
  stdin += d;
});
process.stdin.on("end", () => {
  const evidencePath = process.env.INSPECTRUM_TEST_EVIDENCE;
  if (evidencePath) {
    writeFileSync(
      evidencePath,
      JSON.stringify({
        cwd: process.cwd(),
        pwd: process.env.PWD,
        selectedDir,
        marker: process.env.INSPECTRUM_TEST_MARKER,
        argv: args,
        stdinLength: stdin.length,
      }),
    );
  }
  process.stdout.write(
    JSON.stringify({
      verdict: "approve",
      findings: [],
      summary: "probe ok",
    }),
  );
  process.exit(0);
});
