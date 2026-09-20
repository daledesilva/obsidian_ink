import { readFileSync } from 'fs';
import {
	HANDWRITING_TRANSCRIPTION_FIXTURE_IDS,
	listHandwritingTranscriptionFixtures,
} from '../fixtures/handwriting-transcription/fixtures';
import {
	HANDWRITING_TRANSCRIPTION_VARIANTS,
	transcribeHandwritingVariant,
} from 'src/logic/handwriting-transcription-variants';

const liveEnabled = process.env.HANDWRITING_TRANSCRIPTION_LIVE === '1';
const accessToken = process.env.ALMOSTUSEFUL_APP_ACCESS_TOKEN?.trim();
const portalOrigin = process.env.ALMOSTUSEFUL_PORTAL_ORIGIN?.trim();

function normalizeForComparison(text: string): string {
	return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

const describeLive = liveEnabled && accessToken && portalOrigin ? describe : describe.skip;

describeLive('handwriting transcription live eval', () => {
	beforeAll(() => {
		if (!portalOrigin) return;
		// Device-local staging override for resolveAlmostUsefulPortalOrigin in tests.
		const { writeAlmostUsefulDebugConfig } = require('src/logic/almostuseful/almostuseful-session');
		writeAlmostUsefulDebugConfig({ portalOrigin });
	});

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
				const result = await transcribeHandwritingVariant(variant.id, svg, {
					accessToken,
					idempotencyKey: `live-${pair.id}-${variant.id}-${Date.now()}`,
				});

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
			}, 120_000);
		}
	}
});
