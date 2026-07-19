import {
	buildDrawingEmbed,
	buildDrawingEmbedLine,
	buildWritingEmbed,
	buildWritingEmbedLine,
} from 'src/components/formats/current/utils/build-embeds';

describe('build-embeds', () => {
	it('buildWritingEmbedLine starts with required leading space', () => {
		const line = buildWritingEmbedLine('Ink/Writing/test.svg');
		expect(line.startsWith(' ![')).toBe(true);
		expect(line).toContain('[Edit Writing]');
	});

	it('buildDrawingEmbedLine starts with required leading space', () => {
		const line = buildDrawingEmbedLine('Ink/Drawing/test.svg');
		expect(line.startsWith(' ![')).toBe(true);
		expect(line).toContain('[Edit Drawing]');
	});

	it('trimming block embed removes leading space (regression guard)', () => {
		const block = buildWritingEmbed('Ink/Writing/test.svg');
		expect(block.trim().startsWith('![')).toBe(true);
		expect(buildWritingEmbedLine('Ink/Writing/test.svg').startsWith(' ![')).toBe(true);
	});

	it('block embed wraps line with newlines', () => {
		const block = buildDrawingEmbed('Ink/Drawing/test.svg');
		const line = buildDrawingEmbedLine('Ink/Drawing/test.svg');
		expect(block).toBe(`\n${line}\n`);
	});
});
