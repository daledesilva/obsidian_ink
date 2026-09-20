import {
	buildDrawingEmbed,
	buildDrawingEmbedLine,
	buildWritingEmbed,
	buildWritingEmbedLine,
	formatWritingEmbedAltText,
	patchWritingEmbedTranscriptInEmbedSnippet,
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

	it('formatWritingEmbedAltText keeps emphasis and parentheses', () => {
		expect(formatWritingEmbedAltText('*(note)* ~strike~')).toBe('*(note)* ~strike~');
	});

	it('formatWritingEmbedAltText removes backslashes and angle brackets', () => {
		expect(formatWritingEmbedAltText('a\\b <tag>')).toBe('ab tag');
	});

	it('formatWritingEmbedAltText returns placeholder when only risky chars remain', () => {
		expect(formatWritingEmbedAltText('[]|\\<>')).toBe(WRITING_EMBED_ALT_PLACEHOLDER);
	});

	it('patchWritingEmbedTranscriptInEmbedSnippet replaces InkWriting placeholder', () => {
		const snippet = ' ![InkWriting](<Ink/Writing/test.svg>) [Edit Writing](obsidian://ink)';
		const patched = patchWritingEmbedTranscriptInEmbedSnippet(snippet, 'Hello world');
		expect(patched).toContain('![Hello world]');
		expect(patched).not.toContain('InkWriting');
	});

	it('patchWritingEmbedTranscriptInEmbedSnippet overwrites an existing alt', () => {
		const snippet = ' ![old alt](<Ink/Writing/test.svg>) [Edit Writing](obsidian://ink)';
		const patched = patchWritingEmbedTranscriptInEmbedSnippet(snippet, '**new**\nalt');
		expect(patched).toContain('![**new** alt]');
		expect(patched).not.toContain('old alt');
	});
});
