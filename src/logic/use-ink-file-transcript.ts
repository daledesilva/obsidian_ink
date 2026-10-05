import { useEffect, useState } from 'react';
import { TFile } from 'obsidian';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';

//////////
//////////

/**
 * Reads `meta.transcript` from an ink SVG. Null until the first read finishes;
 * empty string when the file has no transcript. Refreshes on vault modify.
 */
export function useInkFileTranscript(file: TFile | null): string | null {
	const [transcript, setTranscript] = useState<string | null>(null);

	useEffect(() => {
		if (!file) {
			setTranscript(null);
			return;
		}

		let cancelled = false;
		const filePath = file.path;

		const readTranscript = () => {
			file.vault.read(file).then((svg) => {
				if (cancelled) return;
				const data = extractInkJsonFromSvg(svg);
				setTranscript(data?.meta.transcript ?? '');
			}).catch(() => {
				if (cancelled) return;
				setTranscript('');
			});
		};

		setTranscript(null);
		readTranscript();

		const eventRef = file.vault.on('modify', (modifiedFile) => {
			if (modifiedFile.path !== filePath) return;
			readTranscript();
		});

		return () => {
			cancelled = true;
			file.vault.offref(eventRef);
		};
	}, [file, file?.path]);

	return transcript;
}
