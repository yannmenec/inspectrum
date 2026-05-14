#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const command = process.argv[2];

if (command === "--version" || command === "-v") {
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  process.stdout.write(`${pkg.version}\n`);
  process.exit(0);
} else if (command === "--help" || command === "-h") {
  process.stdout.write(
    [
      "inspectrum — multi-LLM plan review MCP server",
      "",
      "Usage:",
      "  inspectrum               start the MCP server on stdio (default)",
      "  inspectrum doctor        check Node, config, sessions dir, and reviewer CLIs",
      "  inspectrum --version     print version",
      "  inspectrum --help        print this help",
      "",
      "Config: ~/.inspectrum/config.toml (optional; defaults to reviewers=[\"claude\"])",
      "Docs:   https://github.com/yannmenec/inspectrum",
      "",
    ].join("\n"),
  );
  process.exit(0);
} else if (command === "doctor") {
  const { runDoctor } = await import("./doctor.js");
  const ok = await runDoctor();
  process.exit(ok ? 0 : 1);
} else {
  await import("./server.js");
}
