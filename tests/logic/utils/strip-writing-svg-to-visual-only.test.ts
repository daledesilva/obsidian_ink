import { readFileSync } from 'fs';
import {
	getHandwritingTranscriptionFixture,
	HANDWRITING_TRANSCRIPTION_DEFAULT_FIXTURE_ID,
} from '../../fixtures/handwriting-transcription/fixtures';
import { stripWritingSvgToVisualOnly } from 'src/logic/utils/strip-writing-svg-to-visual-only';

const defaultFixture = getHandwritingTranscriptionFixture(
	HANDWRITING_TRANSCRIPTION_DEFAULT_FIXTURE_ID,
);

describe('stripWritingSvgToVisualOnly', () => {
	it('removes metadata blocks while keeping stroke markup', () => {
		const svg = readFileSync(defaultFixture.svgPath, 'utf8');
		const visual = stripWritingSvgToVisualOnly(svg);
		expect(visual).not.toContain('<metadata');
		expect(visual).not.toContain('ink-canvas');
		expect(visual).toContain('ink-type-stroke');
		expect(visual.trimStart().startsWith('<svg')).toBe(true);
	});
});
