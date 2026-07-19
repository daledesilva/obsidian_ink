import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { PLUGIN_VERSION } from 'src/constants';
import { DrawingEmbedPreviewWrapper } from 'src/components/formats/current/drawing/drawing-embed-preview/drawing-embed-preview';

const mockVaultRead = jest.fn();

jest.mock('src/stores/global-store', () => ({
	getGlobals: () => ({
		plugin: {
			settings: {
				drawingFrameWhenLocked: false,
				drawingBackgroundWhenLocked: false,
			},
			app: {
				vault: {
					getResourcePath: () => '/vault/drawing.svg',
					read: (...args: unknown[]) => mockVaultRead(...args),
					on: jest.fn(() => jest.fn()),
					offref: jest.fn(),
				},
			},
		},
	}),
}));

function makeEmptyInkCanvasDrawingSvg(): string {
	const inkCanvasJson = JSON.stringify({ version: 1, strokes: [], gridEnabled: false });
	return `<svg xmlns="http://www.w3.org/2000/svg">
		<metadata>
			<ink plugin-version="${PLUGIN_VERSION}" file-type="inkDrawing"/>
			<ink-canvas version="0.5.0">${inkCanvasJson}</ink-canvas>
		</metadata>
	</svg>`;
}

function makeInkCanvasDrawingSvgWithStroke(): string {
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
			<ink plugin-version="${PLUGIN_VERSION}" file-type="inkDrawing"/>
			<ink-canvas version="0.5.0">${inkCanvasJson}</ink-canvas>
		</metadata>
	</svg>`;
}

const makeTFile = (): any => ({
	path: 'path/to/drawing.svg',
	stat: { mtime: 1234567890 },
});

describe('DrawingEmbedPreview', () => {
	beforeEach(() => {
		mockVaultRead.mockReset();
	});

	it('renders preview root element when active', async () => {
		mockVaultRead.mockResolvedValue(makeEmptyInkCanvasDrawingSvg());
		render(
			<JotaiProvider>
				<DrawingEmbedPreviewWrapper
					embeddedFile={makeTFile()}
					embedSettings={{ viewBox: { x: 0, y: 0, width: 100, height: 100 } }}
					onReady={() => {}}
					onClick={() => {}}
				/>
			</JotaiProvider>,
		);

		const el = document.querySelector('.ddc_ink_drawing-embed-preview');
		expect(el).toBeInTheDocument();
	});

	it('forces frame and background classes when empty and settings are off', async () => {
		mockVaultRead.mockResolvedValue(makeEmptyInkCanvasDrawingSvg());
		render(
			<JotaiProvider>
				<DrawingEmbedPreviewWrapper
					embeddedFile={makeTFile()}
					embedSettings={{ viewBox: { x: 0, y: 0, width: 100, height: 100 } }}
					onReady={() => {}}
					onClick={() => {}}
				/>
			</JotaiProvider>,
		);

		await waitFor(() => {
			const preview = document.querySelector('.ddc_ink_drawing-embed-preview');
			expect(preview).toHaveClass('ddc_ink_visible-frame');
			expect(preview).toHaveClass('ddc_ink_visible-background');
		});
	});

	it('omits chrome classes when strokes exist and settings are off', async () => {
		mockVaultRead.mockResolvedValue(makeInkCanvasDrawingSvgWithStroke());
		render(
			<JotaiProvider>
				<DrawingEmbedPreviewWrapper
					embeddedFile={makeTFile()}
					embedSettings={{ viewBox: { x: 0, y: 0, width: 100, height: 100 } }}
					onReady={() => {}}
					onClick={() => {}}
				/>
			</JotaiProvider>,
		);

		await waitFor(() => {
			const preview = document.querySelector('.ddc_ink_drawing-embed-preview');
			expect(preview).not.toHaveClass('ddc_ink_visible-frame');
			expect(preview).not.toHaveClass('ddc_ink_visible-background');
		});
	});
});
