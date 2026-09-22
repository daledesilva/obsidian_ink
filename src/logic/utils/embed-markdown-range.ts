import type { Text } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export type InkEmbedType = 'inkWriting' | 'inkDrawing';

// Any image alt, not only the InkWriting/InkDrawing placeholders. A transcript
// replaces that alt, and framing/size writes must still find the edit link.
const EMBED_MARKDOWN_REGEX: Record<InkEmbedType, RegExp> = {
	inkWriting: / !\[[^\]]*\]\(<[^>]+>\) \[Edit Writing\]\([^)]+\)/,
	inkDrawing: / !\[[^\]]*\]\(<[^>]+>\) \[Edit Drawing\]\([^)]+\)/,
};

export interface EmbedMarkdownRange {
	from: number;
	to: number;
}

/** Detected embed bounds: `markerFrom` is the `!` in `![Ink…]`; `urlEndTo` is after the Edit link closing `)`. */
export interface DetectedEmbedBounds {
	markerFrom: number;
	urlEndTo: number;
}

/**
 * Expands detected embed bounds into the CM6 decoration range.
 * Only consumes a leading `\n ` or leading space, and a trailing `\n`, when those characters exist.
 */
export function getEmbedDecorationRange(
	doc: Text,
	markerFrom: number,
	urlEndTo: number,
): EmbedMarkdownRange {
	let from = markerFrom;
	let to = urlEndTo;

	if (from >= 2 && doc.sliceString(from - 2, from) === '\n ') {
		from -= 2;
	} else if (from >= 1 && doc.sliceString(from - 1, from) === ' ') {
		from -= 1;
	}

	if (to < doc.length && doc.sliceString(to, to + 1) === '\n') {
		to += 1;
	}

	return { from, to };
}

/**
 * Returns the exact embed markdown substring (including leading space when present).
 */
export function getEmbedMarkdownRangeAtDetectedBounds(
	doc: Text,
	markerFrom: number,
	urlEndTo: number,
	embedType: InkEmbedType,
): EmbedMarkdownRange | null {
	let from = markerFrom;
	if (from >= 1 && doc.sliceString(from - 1, from) === ' ') {
		from -= 1;
	}

	const candidate = doc.sliceString(from, urlEndTo);
	const pattern = EMBED_MARKDOWN_REGEX[embedType];
	if (pattern.test(candidate)) {
		return { from, to: urlEndTo };
	}

	const decorationRange = getEmbedDecorationRange(doc, markerFrom, urlEndTo);
	return getEmbedMarkdownRange(doc, decorationRange.from, decorationRange.to, embedType);
}

/**
 * Locates the exact ink embed markdown substring inside a widget decoration slice.
 */
export function getEmbedMarkdownRange(
	doc: Text,
	decFrom: number,
	decTo: number,
	embedType: InkEmbedType,
): EmbedMarkdownRange | null {
	const slice = doc.sliceString(decFrom, decTo);
	const pattern = EMBED_MARKDOWN_REGEX[embedType];
	const match = slice.match(pattern);
	if (match && match.index !== undefined) {
		const from = decFrom + match.index;
		const to = from + match[0].length;
		return { from, to };
	}

	return null;
}

/**
 * True when two embed lines differ only inside `![alt]`.
 * Size and framing live in the edit link. Rebuilding the widget for an alt-only
 * edit drops the live widget and can show the previous viewBox.
 */
export function inkEmbedMarkdownOnlyAltChanged(beforeSnippet: string, afterSnippet: string): boolean {
	const withoutAlt = (snippet: string) => snippet.replace(/!\[[^\]]*\]/, '![alt]');
	return withoutAlt(beforeSnippet) === withoutAlt(afterSnippet);
}

export function getEmbedMarkdownFromDecoration(
	view: EditorView,
	decFrom: number,
	decTo: number,
	embedType: InkEmbedType,
): string | null {
	const range = getEmbedMarkdownRange(view.state.doc, decFrom, decTo, embedType);
	if (!range) return null;
	return view.state.doc.sliceString(range.from, range.to);
}
