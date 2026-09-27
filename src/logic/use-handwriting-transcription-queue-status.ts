import { useEffect, useState } from 'react';
import {
	getHandwritingTranscriptionQueueStatusForFile,
	subscribeHandwritingTranscriptionQueueChanged,
	type HandwritingTranscriptionQueueFileStatus,
} from 'src/logic/handwriting-transcription-queue';

//////////
//////////

/** Live transcription queue status for one ink SVG path. */
export function useHandwritingTranscriptionQueueStatus(
	filePath: string | undefined,
): HandwritingTranscriptionQueueFileStatus | null {
	const [status, setStatus] = useState<HandwritingTranscriptionQueueFileStatus | null>(() => {
		if (!filePath) return null;
		return getHandwritingTranscriptionQueueStatusForFile(filePath);
	});

	useEffect(() => {
		if (!filePath) {
			setStatus(null);
			return;
		}

		const refreshStatus = () => {
			setStatus(getHandwritingTranscriptionQueueStatusForFile(filePath));
		};

		refreshStatus();
		return subscribeHandwritingTranscriptionQueueChanged(refreshStatus);
	}, [filePath]);

	return status;
}
