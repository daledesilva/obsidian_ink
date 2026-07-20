import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

/** Obsidian typed rules — only valid on TS with parserOptions.project */
const typedObsidianRulesOff = {
	"obsidianmd/no-plugin-as-component": "off",
	"obsidianmd/no-view-references-in-plugin": "off",
	"obsidianmd/no-unsupported-api": "off",
	"obsidianmd/prefer-file-manager-trash-file": "off",
	"obsidianmd/prefer-instanceof": "off",
};

export default defineConfig([
	{
		ignores: [
			"node_modules/**",
			"build/**",
			"dist/**",
			"coverage/**",
			".obsidian-cache/**",
			// Obsidian / npm metadata — not linted as TypeScript source
			"manifest.json",
			"manifest-beta.json",
			"package.json",
			"package-lock.json",
			"tsconfig.json",
			"tsconfig.e2e.json",
			"versions.json",
			// Tooling / test harness — not part of the plugin source tree
			"babel.config.js",
			"esbuild.config.mjs",
			"eslint.config.mjs",
			"scripts/**",
			"qa-test-vault/**",
			"tests/**",
			"wdio.conf.mts",
			"version-bump.mjs",
		],
	},
	...obsidianmd.configs.recommended,
	// Obsidian recommended enables type-aware rules on .js / .json too — turn off outside src TS.
	{
		files: ["**/*.js", "**/*.jsx"],
		extends: [tseslint.configs.disableTypeChecked],
		rules: {
			...typedObsidianRulesOff,
			"@typescript-eslint/no-deprecated": "off",
		},
	},
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"obsidianmd/sample-names": "off",
			// 0.4.x recommended forbids disabling any obsidianmd/* rule. Pen scroll-lock
			// teardown must keep literal style writes (avoids unpin flash) with targeted
			// eslint-disable-next-line comments — drop the blanket so those remain valid.
			"eslint-comments/no-restricted-disable": [
				"error",
				"no-console",
				"no-restricted-globals",
				"@typescript-eslint/no-restricted-imports",
				"no-alert",
				"@typescript-eslint/no-deprecated",
				"@typescript-eslint/no-explicit-any",
				"@microsoft/sdl/no-document-write",
				"no-eval",
				"@microsoft/sdl/no-inner-html",
				"obsidianmd/no-nodejs-modules",
			],
		},
	},
]);
