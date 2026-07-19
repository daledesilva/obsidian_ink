import { Text } from '@codemirror/state';
import {
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

	it('returns null when no embed markdown is present', () => {
		const doc = docFromString('abc');
		const range = getEmbedMarkdownRange(doc, 0, 3, 'inkWriting');
		expect(range).toBeNull();
	});
});
