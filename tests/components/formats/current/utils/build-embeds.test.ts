import {
	buildDrawingEmbed,
	buildDrawingEmbedLine,
	buildWritingEmbed,
	buildWritingEmbedLine,
	formatWritingEmbedAltText,
	WRITING_EMBED_ALT_PLACEHOLDER,
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

	it('formatWritingEmbedAltText strips risky chars and collapses whitespace', () => {
		expect(formatWritingEmbedAltText('**bold**\n\n[[link]]|300')).toBe('**bold** link300');
		expect(formatWritingEmbedAltText('   ')).toBe(WRITING_EMBED_ALT_PLACEHOLDER);
		expect(formatWritingEmbedAltText(undefined)).toBe(WRITING_EMBED_ALT_PLACEHOLDER);
	});

	it('buildWritingEmbedLine uses stripped alt for markdown transcript', () => {
		const line = buildWritingEmbedLine('Ink/Writing/test.svg', {
			transcript: 'Hello\n[note](url)',
		});
		expect(line).toContain('![Hello note(url)]');
		expect(line).not.toContain('\n');
	});
});
