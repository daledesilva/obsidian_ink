import { useEffect, useState } from 'react';
import {
	getInkEmbedDisplayMode,
	setInkEmbedDisplayMode,
	subscribeInkEmbedDisplayMode,
	type InkEmbedDisplayMode,
} from 'src/logic/ink-embed-display-mode';

//////////
//////////

/** Live session display mode for one SVG path. */
export function useInkEmbedDisplayMode(filePath: string | undefined): InkEmbedDisplayMode {
	const [mode, setMode] = useState<InkEmbedDisplayMode>(() => {
		if (!filePath) return 'ink';
		return getInkEmbedDisplayMode(filePath);
	});

	useEffect(() => {
		if (!filePath) {
			setMode('ink');
			return;
		}
		setMode(getInkEmbedDisplayMode(filePath));
		return subscribeInkEmbedDisplayMode((changedPath) => {
			if (changedPath !== filePath) return;
			setMode(getInkEmbedDisplayMode(filePath));
		});
	}, [filePath]);

	return mode;
}

export interface LockedInkTranscriptMode {
	hasTranscript: boolean;
	showTranscript: boolean;
}

/**
 * Locked Ink/Text choice for one file. An empty transcript after a finished
 * read drops Text mode so the embed falls back to the SVG.
 */
export function useLockedInkTranscriptMode(
	filePath: string | undefined,
	transcript: string | null,
	isEditing: boolean,
): LockedInkTranscriptMode {
	const mode = useInkEmbedDisplayMode(filePath);

	useEffect(() => {
		if (!filePath || transcript === null) return;
		const transcriptIsEmpty = transcript.trim().length === 0;
		if (!transcriptIsEmpty) return;
		if (getInkEmbedDisplayMode(filePath) !== 'text') return;
		setInkEmbedDisplayMode(filePath, 'ink');
	}, [filePath, transcript]);

	const hasTranscript = !!transcript && transcript.trim().length > 0;
	const showTranscript = !isEditing && hasTranscript && mode === 'text';
	return { hasTranscript, showTranscript };
}
