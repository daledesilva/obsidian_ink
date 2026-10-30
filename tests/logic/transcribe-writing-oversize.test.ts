/**
 * @jest-environment node
 *
 * End-to-end of the size-cap path: real fixture SVGs, real media preparation,
 * slicing, stitching, and JPEG rasterisation. Only the portal POST is stubbed,
 * and it enforces the same decoded-byte cap the portal does. The Obsidian e2e
 * suite never calls the portal, and a live run of these files would spend credits.
 */
import { readFileSync } from 'fs';
import { beforeEach, describe, expect, test } from '@jest/globals';
import {
	HANDWRITING_TRANSCRIPTION_MEDIA_TOO_LARGE_CODE,
	HANDWRITING_TRANSCRIPTION_MODELS,
	HandwritingTranscriptionJobError,
	type HandwritingTranscriptionJobRequest,
	postHandwritingTranscriptionJob,
} from 'src/logic/almostuseful/almostuseful-handwriting-transcription';
import { HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES } from 'src/logic/almostuseful/handwriting-transcription-media-limit';
import { transcribeWriting } from 'src/logic/transcribe-writing';
import { base64DecodedByteLength } from 'src/logic/utils/utf8-byte-length';
import { createNodeWritingSvgCanvas } from '../helpers/node-writing-svg-canvas';
import { OVERSIZED_TRANSCRIPTION_FIXTURES } from '../fixtures/transcription-oversize/fixtures';

jest.mock('src/logic/almostuseful/almostuseful-handwriting-transcription', () => {
	const actual = jest.requireActual(
		'src/logic/almostuseful/almostuseful-handwriting-transcription',
	);
	return {
		...actual,
		postHandwritingTranscriptionJob: jest.fn(),
	};
});

const postJob = jest.mocked(postHandwritingTranscriptionJob);

/**
 * Node has no DOM canvas. The JPEG fallback renders through `document.createElement`.
 */
function installNodeCanvas(): void {
	Object.defineProperty(globalThis, 'document', {
		configurable: true,
		value: {
			createElement: (tagName: string) => {
				if (tagName !== 'canvas') {
					throw new Error(`Unexpected element ${tagName}`);
				}
				return createNodeWritingSvgCanvas();
			},
		},
	});
}

/**
 * Same refusal the portal returns before a transcription job starts.
 */
function mediaTooLargeError(): HandwritingTranscriptionJobError {
	return new HandwritingTranscriptionJobError({
		message: 'media payload is too large',
		status: 400,
		code: HANDWRITING_TRANSCRIPTION_MEDIA_TOO_LARGE_CODE,
		retryable: false,
	});
}

/**
 * Accepts media at or under the cap and rejects anything larger.
 */
function installCapEnforcingPortal(): { acceptedTexts: string[] } {
	const acceptedTexts: string[] = [];
	postJob.mockImplementation(async (body: HandwritingTranscriptionJobRequest) => {
		const decodedBytes = base64DecodedByteLength(body.mediaBase64);
		const isOverCap = decodedBytes > HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES;
		if (isOverCap) throw mediaTooLargeError();
		const text = `Part ${acceptedTexts.length + 1}.`;
		acceptedTexts.push(text);
		return {
			text,
			model: HANDWRITING_TRANSCRIPTION_MODELS.geminiFlashLite,
			mediaType: body.mediaType,
		};
	});
	return { acceptedTexts };
}

describe('transcribeWriting oversized media', () => {
	beforeEach(() => {
		installNodeCanvas();
		Object.defineProperty(globalThis, 'crypto', {
			value: { randomUUID: () => 'test-idempotency-key' },
			configurable: true,
		});
		postJob.mockReset();
	});

	test('sends the full writing SVG, then slices only after the portal refuses it', async () => {
		installCapEnforcingPortal();
		const svg = readFileSync(OVERSIZED_TRANSCRIPTION_FIXTURES.writing, 'utf8');

		const transcript = await transcribeWriting(svg);

		expect(postJob.mock.calls.length).toBeGreaterThan(2);
		const firstBody = postJob.mock.calls[0][0];
		expect(firstBody.mediaType).toBe('image/svg+xml');
		const firstBytes = base64DecodedByteLength(firstBody.mediaBase64);
		expect(firstBytes).toBeGreaterThan(HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES);

		const sliceBodies = postJob.mock.calls.slice(1).map((call) => call[0]);
		for (const body of sliceBodies) {
			expect(body.mediaType).toBe('image/svg+xml');
			const sliceBytes = base64DecodedByteLength(body.mediaBase64);
			expect(sliceBytes).toBeLessThanOrEqual(HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES);
		}
		expect(transcript).toBe('Part 1.\n\nPart 2.');
	});

	test('does not slice writing when the portal refuses for credits', async () => {
		postJob.mockRejectedValue(new HandwritingTranscriptionJobError({
			message: 'Insufficient Almost Useful credits',
			status: 402,
			code: 'payment_required',
			retryable: false,
		}));
		const svg = readFileSync(OVERSIZED_TRANSCRIPTION_FIXTURES.writing, 'utf8');

		await expect(transcribeWriting(svg)).rejects.toMatchObject({ status: 402 });
		expect(postJob).toHaveBeenCalledTimes(1);
	});

	test('retries an oversized drawing as one JPEG and does not slice it', async () => {
		installCapEnforcingPortal();
		const svg = readFileSync(OVERSIZED_TRANSCRIPTION_FIXTURES.drawing, 'utf8');

		const transcript = await transcribeWriting(svg);

		expect(postJob).toHaveBeenCalledTimes(2);
		const svgBody = postJob.mock.calls[0][0];
		const jpegBody = postJob.mock.calls[1][0];
		expect(svgBody.mediaType).toBe('image/svg+xml');
		expect(base64DecodedByteLength(svgBody.mediaBase64)).toBeGreaterThan(
			HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES,
		);
		expect(jpegBody.mediaType).toBe('image/jpeg');
		expect(base64DecodedByteLength(jpegBody.mediaBase64)).toBeLessThanOrEqual(
			HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES,
		);
		const jpegBytes = Buffer.from(jpegBody.mediaBase64, 'base64');
		expect(jpegBytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
		expect(transcript).toBe('Part 1.');
	}, 120_000);
});
