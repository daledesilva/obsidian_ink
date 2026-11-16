//////////
//////////

/**
 * UTF-8 byte length of a string without assuming `TextEncoder`.
 *
 * The transcription cap is a decoded-byte limit, and callers must measure exactly what
 * travels on the wire. Obsidian gives us `TextEncoder` on desktop and mobile, but Jest's
 * jsdom environment does not, so this falls back through the other host globals instead
 * of silently comparing character counts against a byte budget.
 */
export function utf8ByteLength(text: string): number {
	if (typeof Buffer !== 'undefined') return Buffer.byteLength(text, 'utf8');
	if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;

	// Last resort: count code points, treating anything above ASCII as multi-byte.
	let byteLength = 0;
	for (const character of text) {
		const codePoint = character.codePointAt(0) ?? 0;
		if (codePoint < 0x80) byteLength += 1;
		else if (codePoint < 0x800) byteLength += 2;
		else if (codePoint < 0x10000) byteLength += 3;
		else byteLength += 4;
	}
	return byteLength;
}

/**
 * Decoded byte length of a base64 string, without decoding it.
 *
 * Padding characters do not represent bytes, so they are excluded — matching the
 * portal's own `Buffer.from(base64, 'base64').byteLength` accounting.
 */
export function base64DecodedByteLength(base64: string): number {
	const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
	return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}
