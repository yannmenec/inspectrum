#!/usr/bin/env node
const command = process.argv[2];

if (command === "doctor") {
  const { runDoctor } = await import("./doctor.js");
  const ok = await runDoctor();
  process.exit(ok ? 0 : 1);
} else {
  await import("./server.js");
}
