#!/usr/bin/env node
/**
 * Prints which Obsidian version(s) will be tested by E2E.
 * Mirrors the resolution logic in wdio.conf.mts.
 * Run: npm run test:e2e:versions
 */
import { parseObsidianVersions, obsidianBetaAvailable } from "wdio-obsidian-service";
import path from "path";

const cacheDir = path.resolve(".obsidian-cache");
let defaultVersions = "latest/latest";
if (await obsidianBetaAvailable({ cacheDir })) {
  defaultVersions += " latest-beta/latest";
}
const versions = await parseObsidianVersions(
  process.env.OBSIDIAN_VERSIONS ?? defaultVersions,
  { cacheDir }
);
console.log(
  "E2E will test Obsidian versions:",
  versions.map(([a, i]) => `${a}/${i}`).join(", ")
);
