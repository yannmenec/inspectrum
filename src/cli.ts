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
