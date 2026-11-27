import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.unmock('src/logic/utils/storage');
import { getStroke } from 'perfect-freehand';
import { saveLocally } from 'src/logic/utils/storage';
import {
	DEFAULT_HANDWRITING_EXPERIMENTS, HANDWRITING_PRESETS, patchHandwritingExperiments,
	readHandwritingExperiments, sanitizeHandwritingExperiments,
} from 'src/logic/device-settings/handwriting-experiments';
import { drawToolPointerDown, drawToolPointerMove, drawToolPointerUp, drawToolPointerCancel, type DrawToolContext } from 'src/ink-canvas/tools/draw-tool';
import { StrokeStore } from 'src/ink-canvas/stroke-store';
import { UndoManager } from 'src/ink-canvas/undo-manager';
import { DEFAULT_STROKE_STYLE, toStrokeOptions } from 'src/ink-canvas/types';
import { getRenderedStrokeData } from 'src/ink-canvas/rendered-stroke-cache';

function context(preference: 'auto' | 'pen' | 'mouse' = 'pen', zoom = 1) {
	const store = new StrokeStore();
	const undoManager = new UndoManager();
	const attributes = new Map<string, string>();
	const ctx: DrawToolContext = {
		store, undoManager,
		getCamera: () => ({ x: 0, y: 0, zoom }),
		getContainerRect: () => ({ left: 0, top: 0, width: 800, height: 600 } as DOMRect),
		getStrokeStyle: () => ({ ...DEFAULT_STROKE_STYLE }),
		getStrokeInputTreatAsPreference: () => preference,
		getResolvedStrokeInputTreatAs: () => preference === 'auto' ? 'mouse' : preference,
		getLiveStrokePath: () => ({ setAttribute: (key: string, value: string) => attributes.set(key, value) } as unknown as SVGPathElement),
	};
	return { ctx, store, undoManager, attributes };
}
function pointer(type: string, x: number, pressure: number, timeStamp: number) {
	return { type, clientX: x, clientY: 10, pressure, pointerType: 'pen', pointerId: 3, timeStamp } as PointerEvent;
}
function draw(ctx: DrawToolContext) {
	drawToolPointerDown(pointer('pointerdown', 0, 0.2, 0), ctx);
	drawToolPointerMove(pointer('pointermove', 0.2, 0.1, 8), ctx);
	drawToolPointerMove(pointer('pointermove', 2, 0.4, 16), ctx);
	drawToolPointerUp(pointer('pointerup', 4, 0, 24), ctx);
}

beforeEach(() => {
	window.activeWindow.localStorage.clear();
	patchHandwritingExperiments({ ...HANDWRITING_PRESETS.deprecated });
	drawToolPointerCancel({} as PointerEvent, context().ctx);
});

describe('handwriting control-variable experiments', () => {
	test('a fresh device draws with Balanced defaults', () => {
		window.activeWindow.localStorage.clear();
		expect(readHandwritingExperiments()).toEqual(HANDWRITING_PRESETS.balanced);
		const { ctx, store } = context(); draw(ctx);
		expect(store.getAll()[0].style).toMatchObject({ streamline: 0.45, smoothing: 0.5, thinning: 0.48, simulatePressure: false });
	});

	test('saved v1 choices and custom values survive the default change', () => {
		for (const settings of [HANDWRITING_PRESETS.appleNotes, HANDWRITING_PRESETS.balanced, HANDWRITING_PRESETS.deprecated,
			{ ...HANDWRITING_PRESETS.excalidraw, streamline: 0.73, thinning: 0.22 }]) {
			saveLocally('handwritingExperiments_v1', JSON.stringify(settings));
			expect(readHandwritingExperiments()).toEqual(settings);
		}
		saveLocally('handwritingExperiments_v1', JSON.stringify({ version: 1, enabled: true }));
		expect(readHandwritingExperiments()).toMatchObject({ enabled: true, positionStabilization: false, overrideSmoothing: false, pressureProcessing: true });
	});

	test('Deprecated restores the original pipeline after using Balanced', () => {
		const original = context(); draw(original.ctx);
		patchHandwritingExperiments({ ...HANDWRITING_PRESETS.balanced });
		const saved = original.store.getAll()[0];
		const originalPath = getRenderedStrokeData(saved).pathD;
		patchHandwritingExperiments({ ...HANDWRITING_PRESETS.deprecated });
		const restored = context(); draw(restored.ctx);
		expect(restored.store.getAll()[0].points).toEqual(saved.points);
		expect(restored.store.getAll()[0].style).toEqual(saved.style);
		expect(getRenderedStrokeData(restored.store.getAll()[0]).pathD).toBe(originalPath);
		expect(getRenderedStrokeData(JSON.parse(JSON.stringify(saved))).pathD).toBe(originalPath);
	});

	test('corrupt, unknown-version and non-finite settings fall back safely', () => {
		window.activeWindow.localStorage.clear();
		expect(sanitizeHandwritingExperiments({ version: 2, enabled: true })).toEqual(DEFAULT_HANDWRITING_EXPERIMENTS);
		expect(sanitizeHandwritingExperiments({ version: 1, fixedWidthSize: NaN, streamline: 50, smoothing: -1, enabled: 'true' }))
			.toMatchObject({ enabled: false, fixedWidthSize: 4, streamline: 1, smoothing: 0 });
		expect(readHandwritingExperiments()).toEqual(DEFAULT_HANDWRITING_EXPERIMENTS);
	});

	test('disabled overrides retain the ordinary preset even when other values are changed', () => {
		const ordinary = context(); draw(ordinary.ctx);
		patchHandwritingExperiments({ enabled: false, fixedWidth: true, fixedWidthSize: 20, mergePoints: false, pressureProcessing: false, overrideSmoothing: true, streamline: 1 });
		const trial = context(); draw(trial.ctx);
		expect(trial.store.getAll()[0].points).toEqual(ordinary.store.getAll()[0].points);
		expect(trial.store.getAll()[0].style).toEqual(ordinary.store.getAll()[0].style);
		expect(getRenderedStrokeData(trial.store.getAll()[0]).pathD).toBe(getRenderedStrokeData(ordinary.store.getAll()[0]).pathD);
	});

	test.each(['pen', 'auto'] as const)('merge off retains all accepted samples including lift in %s mode', (mode) => {
		patchHandwritingExperiments({ enabled: true, mergePoints: false });
		const { ctx, store } = context(mode); draw(ctx);
		expect(store.getAll()[0].points.map((p) => p[0])).toEqual([0, 0.2, 2, 4]);
	});

	test.each(['pen', 'auto'] as const)('pressure processing off keeps raw pressure, including decreases on merged tips in %s mode', (mode) => {
		patchHandwritingExperiments({ enabled: true, pressureProcessing: false });
		const { ctx, store } = context(mode); draw(ctx);
		expect(store.getAll()[0].points[0][2]).toBe(0.1);
		patchHandwritingExperiments({ mergePoints: false });
		const unmerged = context(mode); draw(unmerged.ctx);
		expect(unmerged.store.getAll()[0].points.map((p) => p[2])).toEqual([0.2, 0.1, 0.4, 0]);
	});

	test('fixed width disables real and simulated pressure and preserves appearance on JSON reload and undo/redo', () => {
		patchHandwritingExperiments({ enabled: true, fixedWidth: true, fixedWidthSize: 6, mergePoints: false });
		const { ctx, store, undoManager } = context('auto'); draw(ctx);
		const stroke = store.getAll()[0];
		expect(stroke.style).toMatchObject({ size: 6, thinning: 0, simulatePressure: false });
		expect(stroke.points.every((p) => p[2] === 0.5)).toBe(true);
		const outline = getStroke([[0, 0, 0.1], [20, 0, 0.9], [40, 0, 0.2]], toStrokeOptions(stroke.style));
		expect(Math.max(...outline.map((p) => p[1])) - Math.min(...outline.map((p) => p[1]))).toBeCloseTo(6);
		const saved = JSON.parse(JSON.stringify(stroke));
		patchHandwritingExperiments({ enabled: false });
		expect(getRenderedStrokeData(saved).pathD).toBe(getRenderedStrokeData(stroke).pathD);
		undoManager.undo(); expect(store.count()).toBe(0);
		undoManager.redo(); expect(store.getAll()[0]).toEqual(stroke);
	});

	test('pressure width off keeps toolbar size, including mouse input', () => {
		patchHandwritingExperiments({ enabled: true, pressureEnabled: false });
		const { ctx, store } = context('mouse'); draw(ctx);
		expect(store.getAll()[0].style).toMatchObject({ size: 7.2, thinning: 0, simulatePressure: false });
	});

	test('changes take effect on the next stroke and absolute smoothing overrides survive pointerup', () => {
		const { ctx, store } = context('auto', 3);
		drawToolPointerDown(pointer('pointerdown', 0, 0.2, 0), ctx);
		patchHandwritingExperiments({ enabled: true, overrideSmoothing: true, streamline: 0.4, smoothing: 0.7 });
		drawToolPointerUp(pointer('pointerup', 4, 0, 24), ctx);
		expect(store.getAll()[0].style.streamline).not.toBe(0.4);
		draw(ctx);
		expect(store.getAll()[1].style).toMatchObject({ streamline: 0.4, smoothing: 0.7, captureZoom: 3 });
	});

	test('Apple Notes preserves captured points through auto recompute and JSON reload', () => {
		patchHandwritingExperiments({ ...HANDWRITING_PRESETS.appleNotes });
		const { ctx, store } = context('auto');
		ctx.getResolvedStrokeInputTreatAs = () => 'pen';
		draw(ctx);
		const pen = context('pen'); draw(pen.ctx);
		expect(store.getAll()[0].points).toEqual(pen.store.getAll()[0].points);
		const stroke = store.getAll()[0];
		expect(stroke.style).toMatchObject({ streamline: 0.4, smoothing: 0.5, thinning: 0.35, simulatePressure: false });
		patchHandwritingExperiments({ ...HANDWRITING_PRESETS.excalidraw });
		expect(getRenderedStrokeData(JSON.parse(JSON.stringify(stroke))).pathD).toBe(getRenderedStrokeData(stroke).pathD);
	});

	test('screen-space stabilization behaves identically at different capture zooms', () => {
		patchHandwritingExperiments({ ...HANDWRITING_PRESETS.appleNotes });
		const a = context('pen', 1), b = context('pen', 0.25);
		draw(a.ctx); draw(b.ctx);
		const first = a.store.getAll()[0].points, second = b.store.getAll()[0].points;
		expect(first.length).toBe(second.length);
		first.forEach((point, index) => {
			expect(second[index][0] * 0.25).toBeCloseTo(point[0], 10);
			expect(second[index][1] * 0.25).toBeCloseTo(point[1], 10);
		});
	});

	test('the Excalidraw preset restores the working configuration and disables the new filter', () => {
		patchHandwritingExperiments({ ...HANDWRITING_PRESETS.appleNotes });
		patchHandwritingExperiments({ ...HANDWRITING_PRESETS.excalidraw });
		expect(readHandwritingExperiments()).toMatchObject({ positionStabilization: false, thinning: 0.6, streamline: 0.5, smoothing: 0.5, pressureProcessing: false });
	});

});
