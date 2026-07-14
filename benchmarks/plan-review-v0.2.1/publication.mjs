#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const NORMALIZATIONS = [
  {
    id: "codex-temp-macos-v1",
    pattern: /(?:\/private)?\/var\/folders\/[^/\\\s"']+\/[^/\\\s"']+\/T\/inspectrum-codex-[A-Za-z0-9]+/g,
    target: "$CODEX_TMP",
  },
  {
    id: "codex-temp-unix-v1",
    pattern: /(?:\/private)?\/tmp\/inspectrum-codex-[A-Za-z0-9]+/g,
    target: "$CODEX_TMP",
  },
];

export function normalizeEphemeralPaths(value) {
  if (typeof value === "string") {
    return NORMALIZATIONS.reduce(
      (text, normalization) => text.replace(normalization.pattern, normalization.target),
      value,
    );
  }
  if (Array.isArray(value)) return value.map(normalizeEphemeralPaths);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeEphemeralPaths(item)]),
    );
  }
  return value;
}

export async function publishJsonl(inputPath, outputPath, metadataPath) {
  if (inputPath === outputPath) throw new Error("input and output paths must differ");
  const input = await readFile(inputPath, "utf8");
  const lines = input.split("\n").filter(Boolean);
  const output = `${lines.map((line) => JSON.stringify(normalizeEphemeralPaths(JSON.parse(line)))).join("\n")}\n`;
  await writeFile(outputPath, output, { mode: 0o600 });
  const metadata = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_sha256: sha256(input),
    output_sha256: sha256(output),
    record_count: lines.length,
    transformations: NORMALIZATIONS.map(({ id, target }) => ({ id, target })),
    scope: "publication paths only; model requests, responses, scores, and ordering are unchanged",
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
  return metadata;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [inputPath, outputPath, metadataPath] = process.argv.slice(2);
  if (!inputPath || !outputPath || !metadataPath) {
    throw new Error("usage: publication.mjs <input.jsonl> <output.jsonl> <metadata.json>");
  }
  console.log(JSON.stringify(await publishJsonl(inputPath, outputPath, metadataPath), null, 2));
}
