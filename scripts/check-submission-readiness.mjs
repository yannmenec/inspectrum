import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMcpbManifest, mcpbArchiveName } from "./mcpb-lib.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const readText = (path) => readFileSync(resolve(root, path), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPngDimensions(path, width, height) {
  const png = readFileSync(resolve(root, path));
  const signature = "89504e470d0a1a0a";
  assert(png.length >= 24, `${path} is too short to contain PNG dimensions`);
  assert(png.subarray(0, 8).toString("hex") === signature, `${path} is not a PNG`);
  assert(
    png.readUInt32BE(16) === width && png.readUInt32BE(20) === height,
    `${path} must be ${width}x${height}`,
  );
}

export function checkLocalSubmissionKit() {
  const pkg = readJson("package.json");
  const lock = readJson("package-lock.json");
  const plugin = readJson(".claude-plugin/plugin.json");
  const marketplace = readJson(".claude-plugin/marketplace.json");
  const registry = readJson("server.json");
  const readme = readText("README.md");
  const kitPath = "docs/distribution/0.2.2-submission-kit.md";
  const kit = readText(kitPath);
  const listing = marketplace.plugins.find((entry) => entry.name === "inspectrum");

  assert(pkg.name === "inspectrum", "npm identifier must remain inspectrum");
  assert(pkg.mcpName === "io.github.yannmenec/inspectrum", "unexpected MCP name");
  assert(registry.name === pkg.mcpName, "server.json name must match package mcpName");
  assert(registry.title === "Inspectrum", "MCP title must be exactly Inspectrum");
  assert(plugin.name === "inspectrum", "Claude plugin identifier must remain inspectrum");
  assert(plugin.displayName === "Inspectrum", "Claude display name must be Inspectrum");
  assert(listing?.displayName === "Inspectrum", "marketplace display name must be Inspectrum");
  assert(createMcpbManifest(pkg).display_name === "Inspectrum", "MCPB display name drift");
  assert(readme.startsWith('<div align="center">\n\n# Inspectrum\n'), "README title drift");

  for (const [label, version] of [
    ["package-lock.json", lock.version],
    ["package-lock root", lock.packages?.[""]?.version],
    ["Claude plugin", plugin.version],
    ["MCP Registry manifest", registry.version],
    ["MCP Registry npm package", registry.packages?.[0]?.version],
  ]) {
    assert(version === pkg.version, `${label} version ${version} does not match ${pkg.version}`);
  }

  for (const path of [
    kitPath,
    "assets/brand/inspectrum-icon.png",
    "assets/brand/social-preview.png",
    "PRIVACY.md",
    "SECURITY.md",
  ]) {
    assert(existsSync(resolve(root, path)), `missing submission asset: ${path}`);
  }
  assertPngDimensions("assets/brand/inspectrum-icon.png", 512, 512);
  assertPngDimensions("assets/brand/social-preview.png", 1280, 640);

  for (const marker of [
    "MCP Registry",
    "Claude Community",
    "Glama",
    "PulseMCP",
    "release-candidate report",
    "Do not submit",
  ]) {
    assert(kit.includes(marker), `${kitPath} is missing ${marker}`);
  }

  return { pkg, registry };
}

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "inspectrum-submission-check" },
    signal: AbortSignal.timeout(15_000),
  });
  assert(response.ok, `${label} returned HTTP ${response.status}`);
  return response.json();
}

export async function checkPublicRelease(pkg) {
  const encodedName = encodeURIComponent(pkg.name);
  const encodedVersion = encodeURIComponent(pkg.version);
  const npm = await fetchJson(
    `https://registry.npmjs.org/${encodedName}/${encodedVersion}`,
    `${pkg.name}@${pkg.version} on npm`,
  );
  assert(npm.version === pkg.version, "npm returned a different version");
  assert(npm.mcpName === pkg.mcpName, "published npm package has a different mcpName");

  const release = await fetchJson(
    `https://api.github.com/repos/yannmenec/inspectrum/releases/tags/v${pkg.version}`,
    `GitHub release v${pkg.version}`,
  );
  assert(release.draft === false, "GitHub release is still a draft");
  assert(release.prerelease === false, "GitHub release is still a prerelease");
  assert(
    release.assets?.some((asset) => asset.name === mcpbArchiveName(pkg)),
    `GitHub release is missing ${mcpbArchiveName(pkg)}`,
  );

  const publicManifest = await fetchJson(
    "https://raw.githubusercontent.com/yannmenec/inspectrum/main/server.json",
    "public server.json on main",
  );
  assert(publicManifest.version === pkg.version, "public server.json version is stale");
  assert(publicManifest.title === "Inspectrum", "public server.json title drift");
}

export async function checkRegistryListing(registry) {
  const data = await fetchJson(
    `https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(registry.name)}`,
    "MCP Registry search",
  );
  const listed = data.servers?.some((entry) => {
    const server = entry.server ?? entry;
    return server.name === registry.name && server.version === registry.version;
  });
  assert(listed, `${registry.name}@${registry.version} is not listed in the MCP Registry`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  for (const arg of args) {
    assert(["--public", "--registry"].includes(arg), `unknown argument: ${arg}`);
  }

  const { pkg, registry } = checkLocalSubmissionKit();
  console.log("Local submission kit is internally consistent.");

  if (args.has("--public") || args.has("--registry")) {
    await checkPublicRelease(pkg);
    console.log(`Public npm and GitHub release gates pass for ${pkg.version}.`);
  }
  if (args.has("--registry")) {
    await checkRegistryListing(registry);
    console.log(`MCP Registry lists ${registry.name}@${registry.version}.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Submission readiness check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
