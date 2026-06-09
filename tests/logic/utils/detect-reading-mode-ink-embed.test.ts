import { findReadingModeInkEmbedCandidates } from 'src/logic/utils/detect-reading-mode-ink-embed';

function mockApp(getFirstLinkpathDest: (linkpath: string, sourcePath: string) => unknown) {
	return {
		metadataCache: { getFirstLinkpathDest },
	} as Parameters<typeof findReadingModeInkEmbedCandidates>[0];
}

describe('findReadingModeInkEmbedCandidates', () => {
	it('finds a drawing embed with adjacent Edit link in the same paragraph', () => {
		const root = document.createElement('div');
		root.innerHTML = `
			<p>
				<span class="internal-embed" alt="InkDrawing" src="Ink/Drawing/test.svg"></span>
				<a href="https://example.com?type=inkDrawing&width=500&aspectRatio=1.778">Edit Drawing</a>
			</p>
		`;

		const mockFile = { path: 'Ink/Drawing/test.svg' };
		const candidates = findReadingModeInkEmbedCandidates(
			mockApp(() => mockFile),
			root,
			'notes/example.md',
		);

		expect(candidates).toHaveLength(1);
		expect(candidates[0].embedKind).toBe('drawing');
		expect(candidates[0].partialEmbedFilepath).toBe('Ink/Drawing/test.svg');
		expect(candidates[0].embedSettings.embedDisplay.width).toBe(500);
		expect(candidates[0].embeddedFile).toBe(mockFile);
	});

	it('finds a writing embed from img alt when Obsidian renders an image element', () => {
		const root = document.createElement('div');
		root.innerHTML = `
			<p>
				<img class="internal-embed" alt="InkWriting" src="Ink/Writing/page.svg" />
				<a href="https://example.com?type=inkWriting&aspectRatio=2.500">Edit Writing</a>
			</p>
		`;

		const candidates = findReadingModeInkEmbedCandidates(
			mockApp(() => null),
			root,
			'notes/example.md',
		);

		expect(candidates).toHaveLength(1);
		expect(candidates[0].embedKind).toBe('writing');
		expect(candidates[0].embedSettings.embedDisplay.aspectRatio).toBeCloseTo(2.5);
	});

	it('finds multiple drawing embeds in the same preview section', () => {
		const root = document.createElement('div');
		root.className = 'markdown-preview-section';
		root.innerHTML = `
			<span class="internal-embed" alt="InkDrawing" src="Ink/Drawing/a.svg"></span>
			<a href="https://example.com?type=inkDrawing&width=400&aspectRatio=1.000">Edit Drawing</a>
			<span class="internal-embed" alt="InkDrawing" src="Ink/Drawing/b.svg"></span>
			<a href="https://example.com?type=inkDrawing&width=600&aspectRatio=2.000">Edit Drawing</a>
		`;

		const candidates = findReadingModeInkEmbedCandidates(
			mockApp((path) => ({ path })),
			root,
			'notes/example.md',
		);

		expect(candidates).toHaveLength(2);
		expect(candidates[0].partialEmbedFilepath).toBe('Ink/Drawing/a.svg');
		expect(candidates[1].partialEmbedFilepath).toBe('Ink/Drawing/b.svg');
		expect(candidates[0].embedSettings.embedDisplay.width).toBe(400);
		expect(candidates[1].embedSettings.embedDisplay.width).toBe(600);
	});

	it('skips embed markers without a matching Edit link', () => {
		const root = document.createElement('div');
		root.innerHTML = `
			<p>
				<span class="internal-embed" alt="InkDrawing" src="Ink/Drawing/test.svg"></span>
			</p>
		`;

		const candidates = findReadingModeInkEmbedCandidates(
			mockApp(() => null),
			root,
			'notes/example.md',
		);

		expect(candidates).toHaveLength(0);
	});
});
