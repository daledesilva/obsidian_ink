import { beforeEach, afterEach, describe, expect, jest, test } from '@jest/globals';
jest.unmock('src/logic/utils/storage');
import { getDenseEraserDetectionEnabled, getEraserTrailEnabled, setDenseEraserDetectionEnabled, setEraserTrailEnabled } from 'src/logic/device-settings/device-settings';
import { createCanvas, Path2D as NativePath2D } from '@napi-rs/canvas';
import { EraserPreview } from 'src/ink-canvas/eraser-preview';
import { EraserHitTester } from 'src/ink-canvas/utils/eraser-hit-tester';
import { getEraserClientSamplePoints } from 'src/ink-canvas/utils/eraser-hit-samples';
import { getRenderedStrokeData } from 'src/ink-canvas/rendered-stroke-cache';
import { StrokeStore } from 'src/ink-canvas/stroke-store';
import { UndoManager } from 'src/ink-canvas/undo-manager';
import { DEFAULT_STROKE_STYLE, type InkStroke, type CameraState } from 'src/ink-canvas/types';
import { eraseToolPointerDown, eraseToolPointerMove, eraseToolPointerUp, eraseToolPointerCancel, type EraseToolContext } from 'src/ink-canvas/tools/erase-tool';

const pathDescriptor = Object.getOwnPropertyDescriptor(window, 'Path2D');
const escapeDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'CSS');
const native = createCanvas(1, 1).getContext('2d');
const pathConstructor = jest.fn((data?: string) => new NativePath2D(data));

beforeEach(() => {
	window.activeWindow.localStorage.clear();
	jest.useFakeTimers();
	pathConstructor.mockClear();
	// Supply real native Canvas geometry where jsdom has no browser implementation.
	Object.defineProperty(window, 'Path2D', { configurable: true, value: pathConstructor });
	jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(native as unknown as CanvasRenderingContext2D);
	Object.defineProperty(globalThis, 'CSS', { configurable: true, value: { escape: (value: string) => value } });
});
afterEach(() => {
	jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); document.body.replaceChildren();
	if (pathDescriptor) Object.defineProperty(window, 'Path2D', pathDescriptor); else Reflect.deleteProperty(window, 'Path2D');
	if (escapeDescriptor) Object.defineProperty(globalThis, 'CSS', escapeDescriptor); else Reflect.deleteProperty(globalThis, 'CSS');
});

function stroke(id: string, x = 100, y = 100): InkStroke {
	return { id, points: [[x, y, 0.5], [x + 20, y, 0.5]], offset: { x: 0, y: 0 },
		style: { ...DEFAULT_STROKE_STYLE, size: 4, thinning: 0, streamline: 0, simulatePressure: false } };
}
const rect = { left: 40, top: 50, right: 840, bottom: 650, width: 800, height: 600 } as DOMRect;
const camera: CameraState = { x: 0, y: 0, zoom: 1 };

function setup(strokes: InkStroke[]) {
	const store = new StrokeStore(); store.replaceAll(strokes);
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	for (const stroke of strokes) {
		const group = document.createElementNS(svg.namespaceURI, 'g');
		group.setAttribute('data-stroke-group', ''); group.setAttribute('data-stroke-id', stroke.id); svg.append(group);
	}
	document.body.append(svg);
	const tester = new EraserHitTester(store, () => svg);
	return { store, svg, tester };
}

describe('cached dense eraser picking', () => {
	test('dense detection defaults on and changing it preserves the independent trail preference', () => {
		expect(getDenseEraserDetectionEnabled()).toBe(true);
		setEraserTrailEnabled(false);
		setDenseEraserDetectionEnabled(false);
		expect(getDenseEraserDetectionEnabled()).toBe(false);
		expect(getEraserTrailEnabled()).toBe(false);
		setDenseEraserDetectionEnabled(true);
		expect(getDenseEraserDetectionEnabled()).toBe(true);
		expect(getEraserTrailEnabled()).toBe(false);
	});

	test('changing density during a gesture takes effect on the next gesture', () => {
		const mark = { ...stroke('interior'), points: [[104, 105, 0.5], [106, 105, 0.5]] as InkStroke['points'] };
		mark.style.size = 0.5;
		const { tester, store, svg } = setup([mark]);
		const ctx: EraseToolContext = { store, undoManager: new UndoManager(), hitTester: tester,
			getCamera: () => camera, getContainerRect: () => rect, getSvgElement: () => svg };
		const pointer = { clientX: 140, clientY: 150 } as PointerEvent;
		setDenseEraserDetectionEnabled(false);
		eraseToolPointerDown(pointer, ctx);
		setDenseEraserDetectionEnabled(true);
		eraseToolPointerMove({ clientX: 141, clientY: 150 } as PointerEvent, ctx);
		eraseToolPointerUp(pointer, ctx);
		jest.advanceTimersByTime(1000);
		expect(store.count()).toBe(1);
		eraseToolPointerDown(pointer, ctx);
		eraseToolPointerUp(pointer, ctx);
		jest.advanceTimersByTime(1000);
		expect(store.count()).toBe(0);
		ctx.undoManager.undo(); expect(store.count()).toBe(1);
		eraseToolPointerCancel(pointer, ctx);
	});
	test('unsupported runtimes request the original picker fallback', () => {
		Object.defineProperty(window, 'Path2D', { configurable: true, value: undefined });
		const { tester } = setup([stroke('a')]);
		expect(tester.hitTest([{ x: 150, y: 150 }], camera, rect)).toBeNull();
	});

	test.each([0.25, 1, 3])('uses the rendered path with camera and stroke offsets at zoom %s', (zoom) => {
		const ink = { ...stroke('a'), offset: { x: 20, y: 30 } };
		const { tester } = setup([ink]);
		const cam = { x: -10, y: -15, zoom };
		const point = { x: rect.left + (110 + 20 - 10) * zoom, y: rect.top + (100 + 30 - 15) * zoom };
		expect(tester.hitTest([point], cam, rect)).toEqual(new Set(['a']));
		expect(tester.hitTest([{ ...point, y: point.y + 10 * zoom }], cam, rect)).toEqual(new Set());
	});

	test('preserves topmost picking, including already touched overlapping ink', () => {
		const { tester } = setup([stroke('bottom'), stroke('top')]);
		const samples = getEraserClientSamplePoints(150, 150, null, 1);
		expect(tester.hitTest(samples, camera, rect)).toEqual(new Set(['top']));
		const builds = pathConstructor.mock.calls.length;
		expect(builds).toBeGreaterThan(0);
		expect(tester.hitTest(samples, camera, rect)).toEqual(new Set(['top']));
		expect(pathConstructor).toHaveBeenCalledTimes(builds);
	});

	test('continues to detect dense interior marks while avoiding all DOM point queries', () => {
		const { tester } = setup([stroke('interior', 104, 105)]);
		const elements = jest.fn(() => { throw new Error('DOM picking must not run'); });
		Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: elements });
		expect(tester.hitTest(getEraserClientSamplePoints(140, 150, null, 1), camera, rect)).toEqual(new Set(['interior']));
		expect(elements).not.toHaveBeenCalled();
	});

	test('updated and removed geometry does not leave stale hits', () => {
		const { tester, store } = setup([stroke('a')]);
		const point = { x: 150, y: 150 };
		expect(tester.hitTest([point], camera, rect)).toEqual(new Set(['a']));
		store.updateOffsets(new Map([['a', { x: 100, y: 0 }]]));
		expect(tester.hitTest([point], camera, rect)).toEqual(new Set());
		expect(tester.hitTest([{ x: 250, y: 150 }], camera, rect)).toEqual(new Set(['a']));
		store.remove(['a']);
		expect(tester.hitTest([{ x: 250, y: 150 }], camera, rect)).toEqual(new Set());
	});

	test('clips queries to the canvas and scrolling ancestors', () => {
		const { tester, svg } = setup([stroke('a')]);
		const scroller = document.createElement('div'); scroller.style.overflowY = 'hidden';
		document.body.append(scroller); scroller.append(svg);
		jest.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ left: 40, top: 50, right: 840, bottom: 149 } as DOMRect);
		expect(tester.hitTest([{ x: 150, y: 150 }], camera, rect)).toEqual(new Set());
	});

	test.each([[true, true], [true, false], [false, true], [false, false]])('erase keeps delayed deletion and undo with trail=%s and dense detection=%s', (enabled, dense) => {
		setDenseEraserDetectionEnabled(dense);
		const { tester, store, svg } = setup([stroke('bottom'), stroke('top')]);
		const browserPicker = jest.fn(() => { throw new Error('Per-pixel DOM picking regression'); });
		Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: browserPicker });
		const overlay = document.createElementNS(svg.namespaceURI, 'g') as SVGGElement;
		overlay.setAttribute('visibility', 'hidden'); svg.append(overlay);
		const preview = new EraserPreview(() => overlay, () => rect, () => camera.zoom);
		preview.setEnabled(enabled);
		const ctx: EraseToolContext = { store, undoManager: new UndoManager(), hitTester: tester, preview,
			getCamera: () => camera, getContainerRect: () => rect, getSvgElement: () => svg };
		const pointer = { clientX: 150, clientY: 150 } as PointerEvent;
		eraseToolPointerDown(pointer, ctx);
		eraseToolPointerMove({ clientX: 160, clientY: 150 } as PointerEvent, ctx);
		expect(overlay.getAttribute('visibility')).toBe(enabled ? 'visible' : 'hidden');
		expect(overlay.children).toHaveLength(enabled ? 2 : 0);
		expect(svg.querySelector('[data-stroke-id="top"]')!.classList.contains('ink-stroke--pending-erase')).toBe(true);
		expect(svg.querySelector('[data-stroke-id="bottom"]')!.classList.contains('ink-stroke--pending-erase')).toBe(false);
		eraseToolPointerUp(pointer, ctx);
		expect(store.count()).toBe(2);
		jest.advanceTimersByTime(1000);
		expect(store.getAllIds()).toEqual(['bottom']);
		ctx.undoManager.undo(); expect(store.count()).toBe(2);
		expect(browserPicker).not.toHaveBeenCalled();
		eraseToolPointerCancel(pointer, ctx);
	});

	test('the native path agrees with the rendered SVG fill across dense test points', () => {
		const ink = stroke('a');
		const { tester } = setup([ink]);
		const path = new NativePath2D(getRenderedStrokeData(ink).pathD);
		for (let x = 97; x <= 124; x += 0.7) {
			for (let y = 97; y <= 103; y += 0.7) {
				const expected = native.isPointInPath(path, x, y);
				expect(tester.hitTest([{ x: rect.left + x, y: rect.top + y }], camera, rect)!.has('a')).toBe(expected);
			}
		}
	});
});
