import { builtinModules } from 'node:module';

/** Shared externals for the photo-trace worker bundle (matches main plugin bundle). */
export const photoTraceWorkerExternals = [
	'obsidian',
	'electron',
	'@codemirror/autocomplete',
	'@codemirror/collab',
	'@codemirror/commands',
	'@codemirror/language',
	'@codemirror/lint',
	'@codemirror/search',
	'@codemirror/state',
	'@codemirror/view',
	'@lezer/common',
	'@lezer/highlight',
	'@lezer/lr',
	...builtinModules.filter((moduleName) => !moduleName.startsWith('_') && moduleName !== 'sys'),
];
