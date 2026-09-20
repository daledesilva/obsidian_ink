import { readFileSync } from 'fs';
import { join } from 'path';
import { stripWritingSvgToVisualOnly } from 'src/logic/utils/strip-writing-svg-to-visual-only';

const fixturePath = join(
	__dirname,
	'../../fixtures/handwriting-transcription/sample-writing.svg',
);

describe('stripWritingSvgToVisualOnly', () => {
	it('removes metadata blocks while keeping path markup', () => {
		const svg = readFileSync(fixturePath, 'utf8');
		const visual = stripWritingSvgToVisualOnly(svg);
		expect(visual).not.toContain('<metadata');
		expect(visual).not.toContain('ink-canvas');
		expect(visual).not.toContain('fixture transcript');
		expect(visual).toContain('<path');
		expect(visual.trimStart().startsWith('<svg')).toBe(true);
	});
});
