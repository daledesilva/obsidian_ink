import * as React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { isEraseToolActive } from 'src/ink-canvas/tools/erase-tool';
import { InkSvgCanvas } from 'src/ink-canvas/ink-svg-canvas';
import { InkCanvasDrawingMenu } from 'src/components/jsx-components/drawing-menu/ink-canvas-drawing-menu';
import { DEFAULT_STROKE_STYLE, type InkCanvasEditor, type InkStroke } from 'src/ink-canvas/types';

jest.unmock('src/components/formats/current/utils/tldraw-helpers');

const resizeObserver = global.ResizeObserver;
const pointerEvent = window.PointerEvent;
beforeEach(() => {
	global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
	// jsdom has no PointerEvent constructor or pointer capture.
	window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
	Element.prototype.setPointerCapture = () => {};
	Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
	jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 } as DOMRect);
});
afterEach(() => { global.ResizeObserver = resizeObserver; window.PointerEvent = pointerEvent; jest.restoreAllMocks(); });

function stroke(id: string, x: number): InkStroke {
	return { id, points: [[x, 100, 0.5], [x + 20, 110, 0.5]], style: { ...DEFAULT_STROKE_STYLE }, offset: { x: 0, y: 0 } };
}

describe('selection deletion from the canvas toolbar', () => {
	test.each([false, true])('delete selected ink as one action, undo and redo (writingMode=%s)', (writingMode) => {
		let editor!: InkCanvasEditor;
		const view = render(<InkSvgCanvas writingMode={writingMode} initialSnapshot={{ version: 1, strokes: [stroke('a', 100), stroke('b', 200), stroke('c', 500)], gridEnabled: false }} onEditorReady={(e) => { editor = e; }} />);
		const menu = render(<InkCanvasDrawingMenu getEditor={() => editor} onStoreChange={() => {}} />);
		expect(menu.queryByRole('button', { name: 'Delete selection' })).toBeNull();
		fireEvent.click(menu.getByRole('button', { name: 'Select' }));
		act(() => editor.setCamera({ x: 0, y: 0, zoom: 1 }));
		const svg = view.container.querySelector<SVGSVGElement>('.ink-svg-canvas')!;
		// Obsidian's createSvg extension, implemented with standard DOM operations.
		Object.defineProperty(svg, 'createSvg', { value: (tag: string) => {
			const child = document.createElementNS(svg.namespaceURI, tag);
			svg.append(child);
			return child;
		} });
		// Lasso around two objects, leaving the third outside.
		fireEvent.pointerDown(svg, { clientX: 70, clientY: 70, button: 0 });
		fireEvent.pointerMove(svg, { clientX: 260, clientY: 70 });
		fireEvent.pointerMove(svg, { clientX: 260, clientY: 150 });
		fireEvent.pointerMove(svg, { clientX: 70, clientY: 150 });
		fireEvent.pointerUp(svg, { clientX: 70, clientY: 70 });
		expect(editor.getSelectedStrokeIds()).toEqual(new Set(['a', 'b']));
		fireEvent.click(menu.getByRole('button', { name: 'Delete selection' }));
		expect(editor.getSnapshot().strokes.map((s) => s.id)).toEqual(['c']);
		expect(editor.getSelectedStrokeIds().size).toBe(0);
		expect(editor.getUndoCount()).toBe(1);
		expect(menu.queryByRole('button', { name: 'Delete selection' })).toBeNull();
		act(() => editor.undo());
		expect(new Set(editor.getSnapshot().strokes.map((s) => s.id))).toEqual(new Set(['a', 'b', 'c']));
		act(() => editor.redo());
		expect(editor.getSnapshot().strokes.map((s) => s.id)).toEqual(['c']);
	});
});


test('switching tools cancels an active eraser preview and gesture', () => {
	let editor!: InkCanvasEditor;
	const view = render(<InkSvgCanvas initialSnapshot={{ version: 1, strokes: [], gridEnabled: false }} onEditorReady={(e) => { editor = e; }} />);
	act(() => { editor.setCamera({ x: 0, y: 0, zoom: 1 }); editor.setTool('erase'); });
	const svg = view.container.querySelector('.ink-svg-canvas')!;
	fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, button: 0 });
	fireEvent.pointerMove(svg, { clientX: 160, clientY: 100 });
	const overlay = svg.querySelector('.ink-canvas-eraser-preview')!;
	expect(isEraseToolActive()).toBe(true);
	expect(overlay.getAttribute('visibility')).toBe('visible');
	act(() => editor.setTool('draw'));
	expect(isEraseToolActive()).toBe(false);
	expect(overlay.getAttribute('visibility')).toBe('hidden');
	expect(overlay.children).toHaveLength(0);
	expect(editor.getSnapshot().strokes).toHaveLength(0);
});
