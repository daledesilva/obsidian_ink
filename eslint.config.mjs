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
			// Keep recommended eslint-comments/no-restricted-disable (includes obsidianmd/*).
			// Community SOURCE CODE scan rejects disables for Obsidian rules; pen scroll-lock
			// literal style writes stay intentional without eslint-disable comments.
		},
	},
]);
