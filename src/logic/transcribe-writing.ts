import {
	buildHandwritingTranscriptionJobRequest,
	HANDWRITING_TRANSCRIPTION_MEDIA_TOO_LARGE_CODE,
	HandwritingTranscriptionJobError,
	postHandwritingTranscriptionJob,
} from 'src/logic/almostuseful/almostuseful-handwriting-transcription';
import {
	HANDWRITING_TRANSCRIPTION_PRODUCTION_MODEL,
	prepareProductionHandwritingTranscriptionMedia,
} from 'src/logic/handwriting-transcription-variants';
import { HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES } from 'src/logic/almostuseful/handwriting-transcription-media-limit';
import { verbose } from 'src/logic/utils/universal-dev-logging';
import { writingSvgToJpegBase64 } from 'src/logic/utils/writing-svg-to-png-base64';
import { stripWritingSvgToVisualOnly } from 'src/logic/utils/strip-writing-svg-to-visual-only';
import {
	planWritingTranscriptionSlices,
	stitchWritingSliceTranscripts,
} from 'src/logic/writing-transcription-slicing';

//////////
//////////

/**
 * True for the two portal refusals that a JPEG re-send can actually fix.
 *
 * Size is obvious. Complexity refusals arrive as a 4xx whose message mentions the media
 * rather than the account, so `retryable === false` alone is too broad — a credits or
 * sign-in refusal must not trigger an expensive rasterisation.
 */
function isMediaRefusalThatJpegCanFix(error: unknown): boolean {
	if (!(error instanceof HandwritingTranscriptionJobError)) return false;
	if (error.code === HANDWRITING_TRANSCRIPTION_MEDIA_TOO_LARGE_CODE) return true;
	if (error.status === 413) return true;
	// `invalid_request` on the media route is how an oversized/complex SVG lands today.
	return error.code === 'invalid_request' && error.status >= 400 && error.status < 500;
}

/**
 * Posts one prepared media payload. Kept separate so slice and JPEG retries share the
 * same request shape and model choice as the single-request path.
 */
async function postPreparedMedia(
	mediaType: 'image/svg+xml' | 'image/png' | 'image/jpeg',
	mediaBase64: string,
): Promise<string> {
	const body = buildHandwritingTranscriptionJobRequest({
		mediaType,
		mediaBase64,
		model: HANDWRITING_TRANSCRIPTION_PRODUCTION_MODEL,
	});
	const response = await postHandwritingTranscriptionJob(body);
	return response.text;
}

/**
 * Re-sends SVG media as a JPEG after the portal refused it for size or complexity.
 *
 * Sending the SVG first keeps the cheaper, higher-fidelity path for the media the model
 * accepts, so only dense pages pay the rasterisation cost. The original error is
 * rethrown when rasterisation produces nothing, so the caller sees the real refusal.
 */
async function transcribeSvgViaJpegFallback(
	svgFileContent: string,
	svgFailure: unknown,
): Promise<string> {
	const visualSvg = stripWritingSvgToVisualOnly(svgFileContent);
	const jpegBase64 = await writingSvgToJpegBase64(visualSvg, {
		maxBytes: HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES,
	});
	if (!jpegBase64) throw svgFailure;
	verbose('Handwriting transcription: retrying refused SVG as JPEG');
	return postPreparedMedia('image/jpeg', jpegBase64);
}

/**
 * Transcribes handwriting or a drawing from a full Ink SVG file string via the
 * Almost Useful portal (`POST /api/jobs/handwriting-transcription`).
 *
 * Over-long handwriting is split on line gaps and stitched back together, because the
 * portal caps decoded media size and a page too long to send cannot otherwise be read.
 * Drawings keep a single request so stroke geometry is never re-cut, with a JPEG retry
 * for the dense cases the portal refuses.
 */
export async function transcribeWriting(writingSvgFileContent: string): Promise<string> {
	const slices = planWritingTranscriptionSlices(writingSvgFileContent);
	if (slices) {
		verbose(`Handwriting transcription: splitting long writing into ${slices.length} slices`);
		const sliceTranscripts: string[] = [];
		for (const slice of slices) {
			const media = await prepareProductionHandwritingTranscriptionMedia(slice.svg);
			try {
				sliceTranscripts.push(await postPreparedMedia(media.mediaType, media.mediaBase64));
			} catch (error) {
				// Any refusal of this slice is retried as JPEG before the page is abandoned.
				// A second failure throws the original error, so earlier slice text is not
				// saved — the stitch only returns when every slice produced text.
				sliceTranscripts.push(await transcribeSvgViaJpegFallback(slice.svg, error));
			}
		}
		return stitchWritingSliceTranscripts(sliceTranscripts);
	}

	verbose('Handwriting transcription: posting visual SVG to Almost Useful portal');
	const media = await prepareProductionHandwritingTranscriptionMedia(writingSvgFileContent);
	try {
		return await postPreparedMedia(media.mediaType, media.mediaBase64);
	} catch (error) {
		const canRetryAsJpeg = isMediaRefusalThatJpegCanFix(error);
		if (!canRetryAsJpeg) throw error;
		return transcribeSvgViaJpegFallback(writingSvgFileContent, error);
	}
}
