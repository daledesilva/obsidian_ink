import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { PLUGIN_VERSION } from 'src/constants';
import { WritingEmbedPreviewWrapper } from 'src/components/formats/current/writing/writing-embed-preview/writing-embed-preview';

function makeEmptyInkCanvasWritingSvg(): string {
	const inkCanvasJson = JSON.stringify({ version: 1, strokes: [], gridEnabled: false });
	return `<svg xmlns="http://www.w3.org/2000/svg">
		<metadata>
			<ink plugin-version="${PLUGIN_VERSION}" file-type="inkWriting"/>
			<ink-canvas version="0.5.0">${inkCanvasJson}</ink-canvas>
		</metadata>
	</svg>`;
}

function makeInkCanvasWritingSvgWithStroke(): string {
	const inkCanvasJson = JSON.stringify({
		version: 1,
		strokes: [{
			id: 's1',
			points: [[0, 0, 0.5], [10, 10, 0.5]],
			style: { size: 4, thinning: 0.5, smoothing: 0.5, streamline: 0.5, easing: 'linear', simulatePressure: true, color: 'currentColor', inputKind: 'mouse' },
			offset: { x: 0, y: 0 },
		}],
		gridEnabled: false,
	});
	return `<svg xmlns="http://www.w3.org/2000/svg">
		<metadata>
			<ink plugin-version="${PLUGIN_VERSION}" file-type="inkWriting"/>
			<ink-canvas version="0.5.0">${inkCanvasJson}</ink-canvas>
		</metadata>
	</svg>`;
}

const makePlugin = (vaultRead: jest.Mock) => ({
	settings: { writingLinesWhenLocked: false, writingBackgroundWhenLocked: false },
	app: {
		vault: {
			getResourcePath: jest.fn(() => '/vault/writing.svg'),
			read: vaultRead,
			on: jest.fn(() => jest.fn()),
			offref: jest.fn(),
		},
	},
});

const makeTFile = (): any => ({
	path: 'path/to/writing.svg',
	stat: { mtime: 1234567890 },
});

describe('WritingEmbedPreview', () => {
	it('renders preview root', async () => {
		const vaultRead = jest.fn().mockResolvedValue(makeEmptyInkCanvasWritingSvg());
		render(
			<JotaiProvider>
				<WritingEmbedPreviewWrapper
					plugin={makePlugin(vaultRead) as any}
					onResize={() => {}}
					writingFile={makeTFile()}
					onClick={() => {}}
				/>
			</JotaiProvider>,
		);

		const el = document.querySelector('.ddc_ink_writing-embed-preview');
		expect(el).toBeInTheDocument();
	});

	it('forces lines and background classes when empty and settings are off', async () => {
		const vaultRead = jest.fn().mockResolvedValue(makeEmptyInkCanvasWritingSvg());
		render(
			<JotaiProvider>
				<WritingEmbedPreviewWrapper
					plugin={makePlugin(vaultRead) as any}
					onResize={() => {}}
					writingFile={makeTFile()}
					onClick={() => {}}
				/>
			</JotaiProvider>,
		);

		await waitFor(() => {
			const preview = document.querySelector('.ddc_ink_writing-embed-preview');
			expect(preview).toHaveClass('ddc_ink_visible-lines');
			expect(preview).toHaveClass('ddc_ink_visible-background');
		});
	});

	it('omits chrome classes when strokes exist and settings are off', async () => {
		const vaultRead = jest.fn().mockResolvedValue(makeInkCanvasWritingSvgWithStroke());
		render(
			<JotaiProvider>
				<WritingEmbedPreviewWrapper
					plugin={makePlugin(vaultRead) as any}
					onResize={() => {}}
					writingFile={makeTFile()}
					onClick={() => {}}
				/>
			</JotaiProvider>,
		);

		await waitFor(() => {
			const preview = document.querySelector('.ddc_ink_writing-embed-preview');
			expect(preview).not.toHaveClass('ddc_ink_visible-lines');
			expect(preview).not.toHaveClass('ddc_ink_visible-background');
		});
	});
});
