import {
	buildHandwritingTranscriptionJobRequest,
	postHandwritingTranscriptionJob,
} from 'src/logic/almostuseful/almostuseful-handwriting-transcription';
import {
	HANDWRITING_TRANSCRIPTION_PRODUCTION_MODEL,
	prepareProductionHandwritingTranscriptionMedia,
} from 'src/logic/handwriting-transcription-variants';
import { verbose } from 'src/logic/utils/universal-dev-logging';

///////////////////
///////////////////

/**
 * Transcribes handwriting from a full Ink writing SVG file string via the
 * Almost Useful portal (`POST /api/jobs/handwriting-transcription`).
 */
export async function transcribeWriting(writingSvgFileContent: string): Promise<string> {
	verbose('Handwriting transcription: posting visual SVG to Almost Useful portal');
	const media = await prepareProductionHandwritingTranscriptionMedia(writingSvgFileContent);
	const body = buildHandwritingTranscriptionJobRequest({
		mediaType: media.mediaType,
		mediaBase64: media.mediaBase64,
		model: HANDWRITING_TRANSCRIPTION_PRODUCTION_MODEL,
	});
	const response = await postHandwritingTranscriptionJob(body);
	return response.text;
}
