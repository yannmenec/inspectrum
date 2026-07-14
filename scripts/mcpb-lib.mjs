const FIXED_DOS_TIME = 0;
const FIXED_DOS_DATE = 33; // 1980-01-01

export function mcpbArchiveName(pkg) {
  return `${pkg.name}-${pkg.version}.mcpb`;
}

export function createMcpbManifest(pkg) {
  const repositoryUrl = pkg.repository.url.replace(/^git\+/, "");
  return {
    manifest_version: "0.3",
    name: pkg.name,
    display_name: "Inspectrum",
    version: pkg.version,
    description: pkg.description,
    author: {
      name: pkg.author,
      url: "https://github.com/yannmenec",
    },
    repository: { type: "git", url: repositoryUrl },
    homepage: pkg.homepage,
    documentation: "https://github.com/yannmenec/inspectrum#readme",
    support: pkg.bugs.url,
    server: {
      type: "node",
      entry_point: "dist/cli.js",
      mcp_config: {
        command: "node",
        args: ["${__dirname}/dist/cli.js"],
        env: {},
      },
    },
    tools: [{
      name: "review_plan",
      description: "Review a development plan with one or more peer LLMs.",
    }],
    keywords: pkg.keywords,
    license: pkg.license,
    privacy_policies: [
      "https://openai.com/policies/privacy-policy/",
      "https://www.anthropic.com/legal/privacy",
      "https://policies.google.com/privacy",
      "https://openrouter.ai/privacy",
      "https://platform.kimi.com/docs/agreement/userprivacy",
      "https://qwenlm.github.io/qwen-code-docs/en/users/support/tos-privacy/",
    ],
    compatibility: {
      platforms: ["darwin"],
      runtimes: { node: ">=20" },
    },
  };
}

function findEndOfCentralDirectory(zip) {
  const firstPossibleOffset = Math.max(0, zip.length - 65_557);
  for (let offset = zip.length - 22; offset >= firstPossibleOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("invalid ZIP: end-of-central-directory record not found");
}

export function readZipEntries(zip) {
  const eocd = findEndOfCentralDirectory(zip);
  const entries = zip.readUInt16LE(eocd + 10);
  const centralOffset = zip.readUInt32LE(eocd + 16);
  if (entries === 0xffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 archives are not supported");
  }

  const result = [];
  let offset = centralOffset;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > eocd || zip.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`invalid ZIP central directory entry ${index}`);
    }
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > eocd || zip.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`invalid ZIP local header for entry ${index}`);
    }
    result.push({
      name: zip.toString("utf8", offset + 46, offset + 46 + nameLength),
      centralOffset: offset,
      localOffset,
      time: zip.readUInt16LE(offset + 12),
      date: zip.readUInt16LE(offset + 14),
      localTime: zip.readUInt16LE(localOffset + 10),
      localDate: zip.readUInt16LE(localOffset + 12),
    });
    offset = nextOffset;
  }
  return result;
}

export function normalizeZipTimestamps(input) {
  const zip = Buffer.from(input);
  for (const entry of readZipEntries(zip)) {
    zip.writeUInt16LE(FIXED_DOS_TIME, entry.centralOffset + 12);
    zip.writeUInt16LE(FIXED_DOS_DATE, entry.centralOffset + 14);
    zip.writeUInt16LE(FIXED_DOS_TIME, entry.localOffset + 10);
    zip.writeUInt16LE(FIXED_DOS_DATE, entry.localOffset + 12);
  }
  return zip;
}
