import { useEffect, useState } from 'react';
import type { TFile, Vault } from 'obsidian';
import { inkFileHasStrokes } from 'src/logic/utils/ink-file-has-strokes';

/**
 * Whether the ink file has user strokes. `null` until the first vault read completes
 * (or when `file` is missing / read fails).
 */
export function useInkFileHasStrokes(file: TFile | null, vault: Vault): boolean | null {
	const [hasStrokes, setHasStrokes] = useState<boolean | null>(null);
	const fileMtime = file?.stat.mtime;

	useEffect(() => {
		if (!file) {
			setHasStrokes(null);
			return;
		}

		const inkFile = file;
		let cancelled = false;

		async function refresh() {
			try {
				const svgString = await vault.cachedRead(inkFile);
				if (!cancelled) {
					setHasStrokes(inkFileHasStrokes(svgString));
				}
			} catch {
				if (!cancelled) {
					setHasStrokes(null);
				}
			}
		}

		void refresh();

		return () => {
			cancelled = true;
		};
	// The preview component already subscribes to vault modifications and changes
	// its mtime-busted source URL. Reuse that render instead of registering a
	// second listener for every Ink embed.
	}, [file, fileMtime, vault]);

	return hasStrokes;
}
