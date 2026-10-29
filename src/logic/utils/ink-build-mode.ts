//////////
//////////

/**
 * esbuild replaces `process.env.NODE_ENV` at compile time.
 * `npm run dev` and `open-qa` bake 'development'. `npm run build` bakes 'production'.
 */
export function isInkDevelopmentBuild(): boolean {
	return process.env.NODE_ENV !== 'production';
}
