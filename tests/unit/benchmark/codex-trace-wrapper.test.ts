import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const wrapper = resolve("benchmarks/plan-review-v0.2.1/codex-trace-wrapper.mjs");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("Codex trace wrapper", () => {
  it("preserves argv/stdin/streams/exit code and captures the final message", () => {
    const dir = mkdtempSync(join(tmpdir(), "inspectrum-trace-test-"));
    dirs.push(dir);
    const fake = join(dir, "fake-codex.mjs");
    const output = join(dir, "last-message.json");
    const captureDir = join(dir, "captures");
    const pointer = join(dir, "current-call.txt");
    const trace = join(captureDir, "call-1.json");
    writeFileSync(pointer, "call-1\n");
    writeFileSync(fake, `
      import { readFileSync, writeFileSync } from "node:fs";
      const input = readFileSync(0, "utf8");
      const index = process.argv.indexOf("--output-last-message");
      writeFileSync(process.argv[index + 1], JSON.stringify({ input, argv: process.argv.slice(2) }));
      process.stdout.write("provider stdout\\n");
      process.stderr.write("provider stderr\\n");
      process.exit(7);
    `);

    const result = spawnSync(process.execPath, [wrapper, fake, "alpha", "--output-last-message", output], {
      input: "synthetic plan",
      encoding: "utf8",
      env: {
        ...process.env,
        CODEX_REAL_BINARY: process.execPath,
        INSPECTRUM_CAPTURE_DIR: captureDir,
        INSPECTRUM_CALL_ID_FILE: pointer,
      },
    });

    expect(result.status).toBe(7);
    expect(result.stdout).toBe("provider stdout\n");
    expect(result.stderr).toBe("provider stderr\n");
    expect(JSON.parse(readFileSync(trace, "utf8"))).toMatchObject({
      argv: [fake, "alpha", "--output-last-message", output],
      stdin: "synthetic plan",
      stdout: "provider stdout\n",
      stderr: "provider stderr\n",
      exit_code: 7,
      last_message: JSON.stringify({ input: "synthetic plan", argv: ["alpha", "--output-last-message", output] }),
    });
  });
});
