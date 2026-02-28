import * as path from "path";
import { parseObsidianVersions, obsidianBetaAvailable } from "wdio-obsidian-service";
import { env } from "process";

const cacheDir = path.resolve(".obsidian-cache");

// "earliest" resolves to minAppVersion (1.00.0) which obsidian-launcher does not provide.
// Use OBSIDIAN_VERSIONS env var to test specific versions, e.g. "1.4.0/1.4.0 latest/latest"
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
