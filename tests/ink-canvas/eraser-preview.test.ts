import { describe, expect, test, jest, beforeEach, afterEach } from '@jest/globals';
import { EraserPreview } from 'src/ink-canvas/eraser-preview';
import { eraserHitRadiusScreenPx } from 'src/ink-canvas/stroke-zoom-scale';
import { getEraserClientSamplePoints } from 'src/ink-canvas/utils/eraser-hit-samples';
import { eraseToolPointerDown, eraseToolPointerMove, eraseToolPointerUp, eraseToolPointerCancel, type EraseToolContext } from 'src/ink-canvas/tools/erase-tool';
import { StrokeStore } from 'src/ink-canvas/stroke-store';
import { UndoManager } from 'src/ink-canvas/undo-manager';

function setup(zoom = 1) {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	const overlay = document.createElementNS(svg.namespaceURI, 'g') as SVGGElement;
	overlay.setAttribute('pointer-events', 'none');
	svg.append(overlay);
	document.body.append(svg);
	const rect = { left: 80, top: 120 } as DOMRect;
	const preview = new EraserPreview(() => overlay, () => rect, () => zoom);
	const ctx: EraseToolContext = {
		store: new StrokeStore(), undoManager: new UndoManager(), preview,
		getCamera: () => ({ x: 0, y: 0, zoom }), getContainerRect: () => rect, getSvgElement: () => svg,
	};
	return { overlay, preview, ctx };
}

function pointer(x: number, y: number) { return { clientX: x, clientY: y } as PointerEvent; }

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); document.body.replaceChildren(); jest.restoreAllMocks(); });

describe('eraser footprint preview', () => {
	test.each([0.1, 0.5, 1, 3])('visible diameter matches hit-test radius at zoom %s with an offset container', (zoom) => {
		const { overlay, preview } = setup(zoom);
		preview.start(100, 150);
		preview.move(130, 170);
		const radius = eraserHitRadiusScreenPx(zoom);
		const samples = getEraserClientSamplePoints(130, 170, null, zoom);
		expect(Math.max(...samples.map((p) => p.x)) - Math.min(...samples.map((p) => p.x))).toBeCloseTo(2 * radius);
		expect(overlay.querySelector('path')!.getAttribute('d')).toMatch(/^M/);
		expect(Number(overlay.querySelector('circle')!.getAttribute('r'))).toBe(radius);
		expect(overlay.querySelector('circle')!.getAttribute('cx')).toBe('50');
		expect(overlay.querySelector('circle')!.getAttribute('cy')).toBe('50');
		expect(overlay.querySelector('circle')!.hasAttribute('stroke')).toBe(false);
		expect(overlay.getAttribute('pointer-events')).toBe('none');
	});

	test('disabling clears a fading trail, cancels animation, and skips geometry until re-enabled', () => {
		const { overlay, preview } = setup();
		preview.start(100, 150);
		preview.move(120, 160);
		preview.end();
		expect(jest.getTimerCount()).toBeGreaterThan(0);
		preview.setEnabled(false);
		expect(overlay.getAttribute('visibility')).toBe('hidden');
		expect(overlay.children).toHaveLength(0);
		expect(jest.getTimerCount()).toBe(0);
		preview.start(100, 150);
		preview.move(120, 160);
		preview.end();
		expect(overlay.children).toHaveLength(0);
		expect(jest.getTimerCount()).toBe(0);
		preview.setEnabled(true);
		preview.start(100, 150);
		expect(overlay.getAttribute('visibility')).toBe('visible');
		preview.clear();
	});

	test('long gestures keep a bounded short tail that decays while the head stays at full size', () => {
		const { overlay, preview } = setup();
		preview.start(80, 120);
		for (let x = 1; x <= 300; x++) {
			jest.advanceTimersByTime(1);
			preview.move(80 + x, 120);
		}
		expect(overlay.querySelectorAll('path')).toHaveLength(1);
		expect(overlay.querySelector('path')!.getAttribute('d')!.length).toBeLessThan(5000);
		jest.advanceTimersByTime(240);
		expect(overlay.querySelector('path')!.getAttribute('d')).toBe('');
		expect(Number(overlay.querySelector('circle')!.getAttribute('r'))).toBe(eraserHitRadiusScreenPx(1));
		// An idle held eraser does not keep a render loop running.
		expect(jest.getTimerCount()).toBe(0);
		preview.clear();
		expect(overlay.children).toHaveLength(0);
		expect(overlay.getAttribute('visibility')).toBe('hidden');
	});

	test('up fades the tail, while cancel clears it immediately, without creating ink or undo commands', () => {
		// jsdom has no rendered geometry; a browser hit-test API is the only stub.
		Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
		const { overlay, ctx } = setup();
		eraseToolPointerDown(pointer(100, 150), ctx);
		eraseToolPointerMove(pointer(120, 160), ctx);
		expect(overlay.getAttribute('visibility')).toBe('visible');
		eraseToolPointerUp(pointer(120, 160), ctx);
		expect(overlay.getAttribute('visibility')).toBe('visible');
		jest.advanceTimersByTime(100);
		expect(Number(overlay.querySelector('circle')!.getAttribute('r'))).toBeLessThan(eraserHitRadiusScreenPx(1));
		jest.advanceTimersByTime(140);
		expect(overlay.getAttribute('visibility')).toBe('hidden');
		expect(jest.getTimerCount()).toBe(0);
		eraseToolPointerDown(pointer(100, 150), ctx);
		eraseToolPointerCancel(pointer(100, 150), ctx);
		expect(overlay.children).toHaveLength(0);
		expect(jest.getTimerCount()).toBe(0);
		expect(ctx.store.count()).toBe(0);
		expect(ctx.undoManager.canUndo()).toBe(false);
	});
});
