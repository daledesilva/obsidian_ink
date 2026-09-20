import { existsSync, readFileSync } from 'fs';
import {
	getHandwritingTranscriptionFixture,
	HANDWRITING_TRANSCRIPTION_FIXTURE_IDS,
	listHandwritingTranscriptionFixtures,
} from './fixtures';

describe('handwriting transcription fixtures', () => {
	it('registers three eval fixtures with svg and expected pairs on disk', () => {
		expect(HANDWRITING_TRANSCRIPTION_FIXTURE_IDS).toEqual([
			'short - single paragraph',
			'short - multi-paragraph',
			'long - multi-paragraph',
		]);

		const fixtures = listHandwritingTranscriptionFixtures();
		expect(fixtures).toHaveLength(3);

		for (const fixture of fixtures) {
			expect(existsSync(fixture.svgPath)).toBe(true);
			expect(existsSync(fixture.expectedPath)).toBe(true);
			expect(readFileSync(fixture.svgPath, 'utf8').trimStart().startsWith('<svg')).toBe(
				true,
			);
			expect(readFileSync(fixture.expectedPath, 'utf8').trim().length).toBeGreaterThan(0);
		}
	});

	it('resolves paths by fixture id', () => {
		const fixture = getHandwritingTranscriptionFixture('long - multi-paragraph');
		expect(fixture.svgPath).toContain('long - multi-paragraph.svg');
		expect(fixture.expectedPath).toContain('long - multi-paragraph.expected.txt');
	});
});
