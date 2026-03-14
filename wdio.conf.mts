import * as path from "path";
import { parseObsidianVersions, obsidianBetaAvailable } from "wdio-obsidian-service";
import { env } from "process";

const cacheDir = path.resolve(".obsidian-cache");

// E2E tests run against Obsidian latest (stable) and latest-beta when available.
// No pinned versions. Override with OBSIDIAN_VERSIONS for ad-hoc testing, e.g.:
//   OBSIDIAN_VERSIONS=latest/latest   — only stable
//   OBSIDIAN_VERSIONS=latest-beta/latest — only beta (when published)
let defaultVersions = "latest/latest";
if (await obsidianBetaAvailable({ cacheDir })) {
  defaultVersions += " latest-beta/latest";
}
const desktopVersions = await parseObsidianVersions(env.OBSIDIAN_VERSIONS ?? defaultVersions, { cacheDir });

if (env.CI) {
  console.log("obsidian-cache-key:", JSON.stringify([desktopVersions]));
}

export const config: WebdriverIO.Config = {
  runner: "local",
  framework: "mocha",

  specs: ["./tests/e2e/**/*.e2e.ts"],

  maxInstances: Number(env.WDIO_MAX_INSTANCES || 4),

  capabilities: desktopVersions.map(([appVersion, installerVersion]) => ({
    browserName: "obsidian",
    "wdio:obsidianOptions": {
      appVersion,
      installerVersion,
      plugins: ["./dist"],
      vault: "qa-test-vault",
    },
  })),

  services: ["obsidian"],
  reporters: ["obsidian"],

  mochaOpts: {
    ui: "bdd",
    timeout: 60 * 1000,
  },
  waitforInterval: 250,
  waitforTimeout: 5 * 1000,
  logLevel: "warn",

  cacheDir,

  injectGlobals: true,
};
