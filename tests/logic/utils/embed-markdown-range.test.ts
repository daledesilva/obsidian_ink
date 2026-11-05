import { Text } from '@codemirror/state';
import {
	findEmbedMarkdownRangeForFile,
	getEmbedDecorationRange,
	getEmbedMarkdownRange,
} from 'src/logic/utils/embed-markdown-range';

function docFromString(content: string): Text {
	return Text.of(content.split('\n'));
}

function docFromSingleLine(content: string): Text {
	return Text.of([content]);
}

describe('getEmbedDecorationRange', () => {
	const writingEmbed = ' ![InkWriting](<Ink/Writing/test.svg>) [Edit Writing](ink?type=inkWriting)';

	it('expands leading space and trailing newline when present', () => {
		const line = ` ${writingEmbed}\n`;
		const doc = docFromSingleLine(line);
		const markerFrom = line.indexOf('!');
		const urlEndTo = line.lastIndexOf(')') + 1;
		const range = getEmbedDecorationRange(doc, markerFrom, urlEndTo);
		expect(range.from).toBe(1);
		expect(range.to).toBe(line.length);
	});

	it('does not expand past EOF when trailing newline is absent', () => {
		const pasted = `Some text\n ${writingEmbed}`;
		const doc = docFromString(pasted);
		const markerFrom = pasted.indexOf('!');
		const urlEndTo = pasted.length;
		const range = getEmbedDecorationRange(doc, markerFrom, urlEndTo);
		expect(range.to).toBe(pasted.length);
		expect(range.to).toBeLessThanOrEqual(doc.length);
	});

	it('includes only leading space for inline embed', () => {
		const inline = `Column text ${writingEmbed} more`;
		const doc = docFromString(inline);
		const markerFrom = inline.indexOf('!');
		const urlEndTo = inline.indexOf(' more');
		const range = getEmbedDecorationRange(doc, markerFrom, urlEndTo);
		expect(doc.sliceString(range.from, range.to)).toBe(writingEmbed);
	});
});

describe('getEmbedMarkdownRange', () => {
	const writingEmbed = ' ![InkWriting](<Ink/Writing/test.svg>) [Edit Writing](ink?type=inkWriting)';
	const drawingEmbed = ' ![InkDrawing](<Ink/Drawing/test.svg>) [Edit Drawing](ink?type=inkDrawing&width=700&aspectRatio=1.333)';

	it('finds writing embed inside block decoration slice with surrounding newlines', () => {
		const block = `\n ${writingEmbed}\n`;
		const doc = docFromString(block);
		const decFrom = 0;
		const decTo = block.length;
		const range = getEmbedMarkdownRange(doc, decFrom, decTo, 'inkWriting');
		expect(range).not.toBeNull();
		expect(doc.sliceString(range!.from, range!.to)).toBe(writingEmbed);
	});

	it('finds drawing embed inline without newlines', () => {
		const inline = `Column text${drawingEmbed} more text`;
		const doc = docFromString(inline);
		const embedStart = inline.indexOf(' ![InkDrawing]');
		const embedEnd = embedStart + drawingEmbed.length;
		const range = getEmbedMarkdownRange(doc, embedStart, embedEnd, 'inkDrawing');
		expect(range).not.toBeNull();
		expect(doc.sliceString(range!.from, range!.to)).toBe(drawingEmbed);
	});

	it('finds a drawing embed after the alt is a transcript', () => {
		const drawingEmbed = ' ![a saved transcript](<Ink/Drawing/test.svg>) [Edit Drawing](ink?type=inkDrawing&width=700&aspectRatio=1.333&viewBoxX=10&viewBoxY=20&viewBoxW=400&viewBoxH=300)';
		const doc = docFromString(`\n${drawingEmbed}\n`);
		const range = getEmbedMarkdownRange(doc, 0, doc.length, 'inkDrawing');
		expect(range).not.toBeNull();
		expect(doc.sliceString(range!.from, range!.to)).toBe(drawingEmbed);
	});

	it('returns null when no embed markdown is present', () => {
		const doc = docFromString('abc');
		const range = getEmbedMarkdownRange(doc, 0, 3, 'inkWriting');
		expect(range).toBeNull();
	});
});

describe('findEmbedMarkdownRangeForFile', () => {
	const writingEmbed = ' ![InkWriting](<Ink/Writing/test.svg>) [Edit Writing](ink?type=inkWriting)';

	// #69: "Remove Embed" did nothing when the decoration-range lookup failed.
	// This path-based search is the fallback that keeps deletion working.
	it('finds a writing embed by file path', () => {
		const note = `# Note\n\n${writingEmbed}\n\nMore text`;
		const doc = docFromString(note);
		const range = findEmbedMarkdownRangeForFile(doc, 'Ink/Writing/test.svg', 'inkWriting');
		expect(range).not.toBeNull();
		expect(doc.sliceString(range!.from, range!.to)).toBe(writingEmbed);
	});

	it('finds a drawing embed by file path', () => {
		const drawingEmbed = ' ![InkDrawing](<Ink/Drawing/test.svg>) [Edit Drawing](ink?type=inkDrawing&width=500)';
		const doc = docFromString(`Text\n\n${drawingEmbed}`);
		const range = findEmbedMarkdownRangeForFile(doc, 'Ink/Drawing/test.svg', 'inkDrawing');
		expect(range).not.toBeNull();
		expect(doc.sliceString(range!.from, range!.to)).toBe(drawingEmbed);
	});

	it('finds an embed whose alt text is a transcript', () => {
		const transcribed = ' ![a saved transcript](<Ink/Writing/test.svg>) [Edit Writing](ink?type=inkWriting)';
		const doc = docFromString(transcribed);
		const range = findEmbedMarkdownRangeForFile(doc, 'Ink/Writing/test.svg', 'inkWriting');
		expect(range).not.toBeNull();
		expect(doc.sliceString(range!.from, range!.to)).toBe(transcribed);
	});

	it('returns null when the file is not embedded', () => {
		const doc = docFromString(`# Note\n\n${writingEmbed}`);
		expect(findEmbedMarkdownRangeForFile(doc, 'Ink/Writing/other.svg', 'inkWriting')).toBeNull();
	});

	it('does not match the wrong embed type for the same file path', () => {
		const doc = docFromString(writingEmbed);
		expect(findEmbedMarkdownRangeForFile(doc, 'Ink/Writing/test.svg', 'inkDrawing')).toBeNull();
	});

	it('escapes regex characters in the file path', () => {
		const trickyEmbed = ' ![InkWriting](<Ink/Writing/a+b (2).svg>) [Edit Writing](ink?type=inkWriting)';
		const doc = docFromString(trickyEmbed);
		const range = findEmbedMarkdownRangeForFile(doc, 'Ink/Writing/a+b (2).svg', 'inkWriting');
		expect(range).not.toBeNull();
	});

	it('finds only the first of two embeds that reference the same file', () => {
		const note = `${writingEmbed}\nMid\n${writingEmbed}`;
		const doc = docFromString(note);
		const range = findEmbedMarkdownRangeForFile(doc, 'Ink/Writing/test.svg', 'inkWriting');
		expect(range).not.toBeNull();
		expect(range!.from).toBeLessThan(note.indexOf('Mid'));
	});
});
