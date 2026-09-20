import { readFileSync } from 'fs';
import {
	getHandwritingTranscriptionFixture,
	HANDWRITING_TRANSCRIPTION_DEFAULT_FIXTURE_ID,
} from '../fixtures/handwriting-transcription/fixtures';
import {
	buildHandwritingTranscriptionJobRequest,
	HANDWRITING_TRANSCRIPTION_JOB_PATH,
	HANDWRITING_TRANSCRIPTION_MODELS,
} from 'src/logic/almostuseful/almostuseful-handwriting-transcription';
import {
	encodeUtf8TextToBase64,
	getHandwritingTranscriptionVariant,
	HANDWRITING_TRANSCRIPTION_VARIANTS,
	prepareHandwritingTranscriptionMedia,
	prepareProductionHandwritingTranscriptionMedia,
	transcribeHandwritingVariant,
} from 'src/logic/handwriting-transcription-variants';
import { stripWritingSvgToVisualOnly } from 'src/logic/utils/strip-writing-svg-to-visual-only';

jest.mock('src/logic/almostuseful/almostuseful-handwriting-transcription', () => {
	const actual = jest.requireActual(
		'src/logic/almostuseful/almostuseful-handwriting-transcription',
	);
	return {
		...actual,
		postHandwritingTranscriptionJob: jest.fn(),
	};
});

import { postHandwritingTranscriptionJob } from 'src/logic/almostuseful/almostuseful-handwriting-transcription';

const postJob = jest.mocked(postHandwritingTranscriptionJob);

const defaultFixture = getHandwritingTranscriptionFixture(
	HANDWRITING_TRANSCRIPTION_DEFAULT_FIXTURE_ID,
);

describe('handwriting-transcription variants', () => {
	beforeEach(() => {
		postJob.mockReset();
		postJob.mockResolvedValue({
			text: 'Hello world',
			creditsRemaining: '9.00',
			amountUsd: '0.001',
			model: HANDWRITING_TRANSCRIPTION_MODELS.geminiFlashLite,
			mediaType: 'image/svg+xml',
		});
	});

	it('defines svg and png eval variants for each allowed model', () => {
		expect(HANDWRITING_TRANSCRIPTION_VARIANTS.map((v) => v.id)).toEqual([
			'svg-gemini-flash-lite',
			'png-gemini-flash-lite',
			'svg-gemini-flash',
			'png-gemini-flash',
			'svg-gpt5-nano',
			'png-gpt5-nano',
			'svg-gpt-4.1-mini',
			'png-gpt-4.1-mini',
			'svg-claude-haiku-4.5',
			'png-claude-haiku-4.5',
		]);
	});

	it('buildHandwritingTranscriptionJobRequest includes model when provided', () => {
		const body = buildHandwritingTranscriptionJobRequest({
			mediaType: 'image/png',
			mediaBase64: 'abc123',
			model: HANDWRITING_TRANSCRIPTION_MODELS.gpt5Nano,
			idempotencyKey: 'test-key',
		});
		expect(body).toEqual({
			idempotencyKey: 'test-key',
			mediaType: 'image/png',
			mediaBase64: 'abc123',
			model: 'openai/gpt-5-nano',
			clientId: 'ink',
			displayName: 'Ink',
		});
	});

	it('omits model from request when not provided (portal default)', () => {
		const body = buildHandwritingTranscriptionJobRequest({
			mediaType: 'image/png',
			mediaBase64: 'abc123',
			idempotencyKey: 'test-key',
		});
		expect(body).not.toHaveProperty('model');
	});

	it('prepareProductionHandwritingTranscriptionMedia injects theme-aware opaque page', async () => {
		const svg = readFileSync(defaultFixture.svgPath, 'utf8');
		const media = await prepareProductionHandwritingTranscriptionMedia(svg);
		expect(media.mediaType).toBe('image/svg+xml');
		const decoded = Buffer.from(media.mediaBase64, 'base64').toString('utf8');
		expect(decoded).not.toContain('<metadata');
		expect(decoded).toContain('fill="#ffffff"');
	});

	it('prepareHandwritingTranscriptionMedia strips metadata for svg variant', async () => {
		const svg = readFileSync(defaultFixture.svgPath, 'utf8');
		const variant = getHandwritingTranscriptionVariant('svg-gemini-flash-lite');
		const media = await prepareHandwritingTranscriptionMedia(variant, svg);
		expect(media.mediaType).toBe('image/svg+xml');
		const decoded = Buffer.from(media.mediaBase64, 'base64').toString('utf8');
		expect(decoded).not.toContain('<metadata');
		expect(decoded).toContain('fill="#ffffff"');
		expect(decoded).toContain(stripWritingSvgToVisualOnly(svg).replace(/<svg\b[^>]*>/i, ''));
	});

	it('prepareHandwritingTranscriptionMedia uses injected png for png variant', async () => {
		const svg = readFileSync(defaultFixture.svgPath, 'utf8');
		const variant = getHandwritingTranscriptionVariant('png-gpt5-nano');
		const media = await prepareHandwritingTranscriptionMedia(variant, svg, {
			pngBase64: 'fakePngBase64',
		});
		expect(media).toEqual({
			mediaType: 'image/png',
			mediaBase64: 'fakePngBase64',
		});
	});

	it('transcribeHandwritingVariant posts model override for eval', async () => {
		const svg = readFileSync(defaultFixture.svgPath, 'utf8');
		const result = await transcribeHandwritingVariant('svg-gpt5-nano', svg, {
			accessToken: 'test-token',
			idempotencyKey: 'eval-1',
		});
		expect(result.variantId).toBe('svg-gpt5-nano');
		expect(result.text).toBe('Hello world');
		expect(postJob).toHaveBeenCalledWith(
			expect.objectContaining({
				idempotencyKey: 'eval-1',
				model: HANDWRITING_TRANSCRIPTION_MODELS.gpt5Nano,
				mediaType: 'image/svg+xml',
			}),
			{ accessToken: 'test-token' },
		);
	});

	it('encodeUtf8TextToBase64 round-trips utf8', () => {
		const encoded = encodeUtf8TextToBase64('Line one\nLine two');
		expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe('Line one\nLine two');
	});

	it('exports generic job path constant', () => {
		expect(HANDWRITING_TRANSCRIPTION_JOB_PATH).toBe('/api/jobs/handwriting-transcription');
	});
});
