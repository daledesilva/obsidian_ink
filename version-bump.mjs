import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

// Sync package version into the public manifest while preserving the current
// minAppVersion floor (raised when unguarded Obsidian APIs require it).
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// Record this release's floor only. Older pluginVersion keys must stay so
// Obsidian can fall back when the user's app is below the latest minAppVersion.
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));
