/** @jest-environment node */

import { readFileSync } from 'fs';
import {
	ALMOSTUSEFUL_LIVE_TEST_CLIENT_DISPLAY_NAME,
	ALMOSTUSEFUL_LIVE_TEST_CLIENT_ID,
	resolveAlmostUsefulLiveAccessToken,
	resolveAlmostUsefulPortalOriginForLiveTests,
} from '../helpers/almostuseful-live-auth';
import { createNodeWritingSvgCanvas } from '../helpers/node-writing-svg-canvas';
import {
	HANDWRITING_TRANSCRIPTION_FIXTURE_IDS,
	listHandwritingTranscriptionFixtures,
} from '../fixtures/handwriting-transcription/fixtures';
import {
	HANDWRITING_TRANSCRIPTION_VARIANTS,
	transcribeHandwritingVariant,
} from 'src/logic/handwriting-transcription-variants';

const liveEnabled = process.env.HANDWRITING_TRANSCRIPTION_LIVE === '1';

function normalizeForComparison(text: string): string {
	return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** OpenRouter 429s mid-matrix; wait and retry so long fixtures still produce a quality row. */
async function transcribeWithRateLimitRetry(
	run: () => ReturnType<typeof transcribeHandwritingVariant>,
): Promise<Awaited<ReturnType<typeof transcribeHandwritingVariant>>> {
	const maxAttempts = 5;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await run();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const isRateLimit = /rate limit/i.test(message);
			if (!isRateLimit || attempt === maxAttempts) {
				throw error;
			}
			const waitMs = 20_000 * attempt;
			console.log(
				`[handwriting-transcription-live] Rate limited; retry ${attempt}/${maxAttempts - 1} in ${waitMs}ms`,
			);
			await sleep(waitMs);
		}
	}
	throw new Error('Rate-limit retry exhausted');
}

const describeLive = liveEnabled ? describe : describe.skip;

describeLive('handwriting transcription live eval', () => {
	let liveAccessToken = '';

	beforeAll(async () => {
		const portalOrigin = resolveAlmostUsefulPortalOriginForLiveTests();
		const { writeAlmostUsefulDebugConfig } = require('src/logic/almostuseful/almostuseful-session');
		writeAlmostUsefulDebugConfig({ portalOrigin });
		liveAccessToken = await resolveAlmostUsefulLiveAccessToken();
		console.log('[handwriting-transcription-live] Portal auth ready.');
	}, 120_000);

	const fixturePairs = listHandwritingTranscriptionFixtures();

	if (fixturePairs.length === 0) {
		it('has all registered svg + expected.txt fixture pairs', () => {
			const missing = HANDWRITING_TRANSCRIPTION_FIXTURE_IDS.filter(
				(id) => !fixturePairs.some((fixture) => fixture.id === id),
			);
			throw new Error(
				`Missing handwriting transcription fixtures: ${missing.join(', ')}. ` +
					'Add matching .svg and .expected.txt files under tests/fixtures/handwriting-transcription/.',
			);
		});
		return;
	}

	for (const pair of fixturePairs) {
		for (const variant of HANDWRITING_TRANSCRIPTION_VARIANTS) {
			it(`${pair.id} — ${variant.id}`, async () => {
				const svg = readFileSync(pair.svgPath, 'utf8');
				const expected = readFileSync(pair.expectedPath, 'utf8');
				const result = await transcribeWithRateLimitRetry(() =>
					transcribeHandwritingVariant(variant.id, svg, {
						accessToken: liveAccessToken,
						idempotencyKey: `live-${pair.id}-${variant.id}-${Date.now()}`,
						clientId: ALMOSTUSEFUL_LIVE_TEST_CLIENT_ID,
						displayName: ALMOSTUSEFUL_LIVE_TEST_CLIENT_DISPLAY_NAME,
						createCanvas: createNodeWritingSvgCanvas,
					}),
				);

				expect(result.text.trim().length).toBeGreaterThan(0);
				// Log for manual cost/quality comparison — do not fail CI on OCR error rate.
				console.log(
					JSON.stringify({
						fixture: pair.id,
						variant: variant.id,
						amountUsd: result.amountUsd,
						creditsRemaining: result.creditsRemaining,
						model: result.model,
						mediaType: result.mediaType,
						expectedNormalized: normalizeForComparison(expected),
						actualNormalized: normalizeForComparison(result.text),
					}),
				);
				await sleep(3000);
			}, 180_000);
		}
	}
});
