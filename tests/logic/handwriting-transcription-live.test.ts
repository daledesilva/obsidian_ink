import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
	HANDWRITING_TRANSCRIPTION_VARIANTS,
	transcribeHandwritingVariant,
} from 'src/logic/handwriting-transcription-variants';

const fixturesDir = join(__dirname, '../fixtures/handwriting-transcription');
const liveEnabled = process.env.HANDWRITING_TRANSCRIPTION_LIVE === '1';
const accessToken = process.env.ALMOSTUSEFUL_APP_ACCESS_TOKEN?.trim();
const portalOrigin = process.env.ALMOSTUSEFUL_PORTAL_ORIGIN?.trim();

function normalizeForComparison(text: string): string {
	return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function listFixturePairs(): Array<{ svgPath: string; expectedPath: string; name: string }> {
	if (!existsSync(fixturesDir)) return [];
	return readdirSync(fixturesDir)
		.filter((name) => name.endsWith('.svg'))
		.map((name) => {
			const base = name.replace(/\.svg$/, '');
			return {
				name: base,
				svgPath: join(fixturesDir, name),
				expectedPath: join(fixturesDir, `${base}.expected.txt`),
			};
		})
		.filter((pair) => existsSync(pair.expectedPath));
}

const describeLive = liveEnabled && accessToken && portalOrigin ? describe : describe.skip;

describeLive('handwriting transcription live eval', () => {
	beforeAll(() => {
		if (!portalOrigin) return;
		// Device-local staging override for resolveAlmostUsefulPortalOrigin in tests.
		const { writeAlmostUsefulDebugConfig } = require('src/logic/almostuseful/almostuseful-session');
		writeAlmostUsefulDebugConfig({ portalOrigin });
	});

	const fixturePairs = listFixturePairs();

	if (fixturePairs.length === 0) {
		it('has at least one svg + expected.txt fixture pair', () => {
			throw new Error('Add handwriting SVG fixtures with matching .expected.txt files');
		});
		return;
	}

	for (const pair of fixturePairs) {
		for (const variant of HANDWRITING_TRANSCRIPTION_VARIANTS) {
			it(`${pair.name} — ${variant.id}`, async () => {
				const svg = readFileSync(pair.svgPath, 'utf8');
				const expected = readFileSync(pair.expectedPath, 'utf8');
				const result = await transcribeHandwritingVariant(variant.id, svg, {
					accessToken,
					idempotencyKey: `live-${pair.name}-${variant.id}-${Date.now()}`,
				});

				expect(result.text.trim().length).toBeGreaterThan(0);
				// Log for manual cost/quality comparison — do not fail CI on OCR error rate.
				console.log(
					JSON.stringify({
						fixture: pair.name,
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
