import { useEffect, useState } from 'react';
import type { TFile, Vault } from 'obsidian';
import { inkFileHasStrokes } from 'src/logic/utils/ink-file-has-strokes';

/**
 * Whether the ink file has user strokes. `null` until the first vault read completes
 * (or when `file` is missing / read fails).
 */
export function useInkFileHasStrokes(file: TFile | null, vault: Vault): boolean | null {
	const [hasStrokes, setHasStrokes] = useState<boolean | null>(null);

	useEffect(() => {
		if (!file) {
			setHasStrokes(null);
			return;
		}

		const inkFile = file;
		let cancelled = false;

		async function refresh() {
			try {
				const svgString = await vault.read(inkFile);
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

		const onModify = (modifiedFile: TFile) => {
			if (modifiedFile.path !== inkFile.path) return;
			void refresh();
		};
		const eventRef = vault.on('modify', onModify);

		return () => {
			cancelled = true;
			// @ts-ignore - offref exists in Obsidian API
			vault.offref(eventRef);
		};
	}, [file, vault]);

	return hasStrokes;
}
