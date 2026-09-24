/**
 * Session-only Ink vs Text choice for a locked embed, keyed by SVG path.
 * Memory only: it is not written into the note and does not sync.
 * Same-tab listeners use a custom event because there is no storage write.
 */

export type InkEmbedDisplayMode = 'ink' | 'text';

const DISPLAY_MODE_CHANGED_EVENT = 'ddc-ink-embed-display-mode-changed';

const modesByFilePath = new Map<string, InkEmbedDisplayMode>();

/** Ink unless this session has switched that file to Text. */
export function getInkEmbedDisplayMode(filePath: string): InkEmbedDisplayMode {
	return modesByFilePath.get(filePath) ?? 'ink';
}

/** Remembers the locked-embed display for every mount of this SVG in the session. */
export function setInkEmbedDisplayMode(filePath: string, mode: InkEmbedDisplayMode): void {
	if (mode === 'ink') {
		modesByFilePath.delete(filePath);
	} else {
		modesByFilePath.set(filePath, mode);
	}
	window.dispatchEvent(new CustomEvent(DISPLAY_MODE_CHANGED_EVENT, {
		detail: { filePath },
	}));
}

/** Same-tab updates. The callback receives the SVG path that changed. */
export function subscribeInkEmbedDisplayMode(onChange: (filePath: string) => void): () => void {
	const wrapped = (event: Event): void => {
		const detail = (event as CustomEvent<{ filePath?: string }>).detail;
		onChange(detail?.filePath ?? '');
	};
	window.addEventListener(DISPLAY_MODE_CHANGED_EVENT, wrapped);
	return () => {
		window.removeEventListener(DISPLAY_MODE_CHANGED_EVENT, wrapped);
	};
}
