import { readFileSync } from 'fs';
import { describe, expect, test, beforeEach } from '@jest/globals';
import {
	getHandwritingTranscriptionFixture,
	HANDWRITING_TRANSCRIPTION_DEFAULT_FIXTURE_ID,
} from '../fixtures/handwriting-transcription/fixtures';
import {
	HANDWRITING_TRANSCRIPTION_MODELS,
	postHandwritingTranscriptionJob,
} from 'src/logic/almostuseful/almostuseful-handwriting-transcription';
import { transcribeWriting } from 'src/logic/transcribe-writing';

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

const defaultFixture = getHandwritingTranscriptionFixture(
	HANDWRITING_TRANSCRIPTION_DEFAULT_FIXTURE_ID,
);

describe('transcribeWriting', () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, 'crypto', {
			value: { randomUUID: () => 'test-idempotency-key' },
			configurable: true,
		});
		postJob.mockReset();
		postJob.mockResolvedValue({
			text: 'Hello world',
			creditsRemaining: '9.00',
			amountUsd: '0.000058',
			model: HANDWRITING_TRANSCRIPTION_MODELS.geminiFlashLite,
			mediaType: 'image/svg+xml',
		});
	});

	test('posts visual svg with theme-aware page and gemini flash-lite', async () => {
		const svg = readFileSync(defaultFixture.svgPath, 'utf8');
		const transcript = await transcribeWriting(svg);
		expect(transcript).toBe('Hello world');
		expect(postJob).toHaveBeenCalledWith(
			expect.objectContaining({
				mediaType: 'image/svg+xml',
				model: HANDWRITING_TRANSCRIPTION_MODELS.geminiFlashLite,
			}),
		);
		const body = postJob.mock.calls[0][0];
		const decoded = Buffer.from(body.mediaBase64, 'base64').toString('utf8');
		expect(decoded).not.toContain('<metadata');
		expect(decoded).toContain('fill="#ffffff"');
	});
});
