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

	it('dedupes nested span.internal-embed and img markers (Obsidian reading DOM)', () => {
		const root = document.createElement('div');
		root.innerHTML = `
			<div class="el-p">
				<p dir="auto">
					<span alt="InkWriting" src="Ink/Writing/2026.6.10 - 0.10am.svg" class="internal-embed media-embed image-embed is-loaded">
						<img alt="InkWriting" src="app://obsidian.md/Ink/Writing/2026.6.10%20-%200.10am.svg?t=123">
					</span>
					<a class="external-link" href="https://youtu.be/2arL1jh8ihA?type=inkWriting&aspectRatio=3.810">Edit Writing</a>
				</p>
			</div>
		`;

		const mockFile = { path: 'Ink/Writing/2026.6.10 - 0.10am.svg' };
		const candidates = findReadingModeInkEmbedCandidates(
			mockApp((path) => (path === 'Ink/Writing/2026.6.10 - 0.10am.svg' ? mockFile : null)),
			root,
			'notes/example.md',
		);

		expect(candidates).toHaveLength(1);
		expect(candidates[0].embedKind).toBe('writing');
		expect(candidates[0].partialEmbedFilepath).toBe('Ink/Writing/2026.6.10 - 0.10am.svg');
		expect(candidates[0].embedMarkerEl.tagName).toBe('SPAN');
		expect(candidates[0].embeddedFile).toBe(mockFile);
	});

	it('resolves vault path from app:// temp-vault absolute img src', () => {
		const root = document.createElement('div');
		root.innerHTML = `
			<p>
				<img alt="InkWriting" src="app://vault-id/var/folders/tmp/qa-test-vault-abc/Ink/Writing/reading-mode-writing.svg?t=123" />
				<a href="https://example.com?type=inkWriting&aspectRatio=2.500">Edit Writing</a>
			</p>
		`;

		const mockFile = { path: 'Ink/Writing/reading-mode-writing.svg' };
		const candidates = findReadingModeInkEmbedCandidates(
			mockApp((path) => (path === 'Ink/Writing/reading-mode-writing.svg' ? mockFile : null)),
			root,
			'notes/example.md',
		);

		expect(candidates).toHaveLength(1);
		expect(candidates[0].partialEmbedFilepath).toBe('Ink/Writing/reading-mode-writing.svg');
	});

	it('resolves vault path from app:// img src when img is the only marker', () => {
		const root = document.createElement('div');
		root.innerHTML = `
			<p>
				<img alt="InkDrawing" src="app://obsidian.md/Ink/Drawing/reading-mode-drawing.svg?t=456" />
				<a href="https://example.com?type=inkDrawing&width=500&aspectRatio=2.500">Edit Drawing</a>
			</p>
		`;

		const mockFile = { path: 'Ink/Drawing/reading-mode-drawing.svg' };
		const candidates = findReadingModeInkEmbedCandidates(
			mockApp((path) => (path === 'Ink/Drawing/reading-mode-drawing.svg' ? mockFile : null)),
			root,
			'notes/example.md',
		);

		expect(candidates).toHaveLength(1);
		expect(candidates[0].partialEmbedFilepath).toBe('Ink/Drawing/reading-mode-drawing.svg');
		expect(candidates[0].embeddedFile).toBe(mockFile);
	});
});
