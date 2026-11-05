import { describe, expect, test, afterEach } from '@jest/globals';
import {
	selectToolPointerCancel,
	selectToolPointerDown,
	selectToolPointerMove,
	selectToolPointerUp,
	SELECT_STROKE_DRAG_THRESHOLD_SCREEN_PX,
	type SelectToolContext,
} from 'src/ink-canvas/tools/select-tool';
import { selectionChromeFromBounds } from 'src/ink-canvas/selection-chrome';
import { StrokeStore } from 'src/ink-canvas/stroke-store';
import { UndoManager } from 'src/ink-canvas/undo-manager';
import type { CameraState } from 'src/ink-canvas/types';
import type { StrokeBounds } from 'src/ink-canvas/svg-export';

function domRect(left: number, top: number, width: number, height: number): DOMRect {
	return {
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
		x: left,
		y: top,
		toJSON: () => ({}),
	} as DOMRect;
}

const CONTAINER_RECT = domRect(0, 0, 800, 600);
const CAMERA: CameraState = { x: 0, y: 0, zoom: 1 };

function pointerEvent(clientX: number, clientY: number): PointerEvent {
	return { clientX, clientY } as PointerEvent;
}

function buildSelectContext(options: {
	selectedIds: Set<string>;
	chromeBounds?: StrokeBounds;
}): { ctx: SelectToolContext; getSelected: () => Set<string> } {
	const store = new StrokeStore();
	const undoManager = new UndoManager();
	let selectedIds = new Set(options.selectedIds);
	let selectionChrome = options.chromeBounds
		? selectionChromeFromBounds(options.chromeBounds)
		: null;

	const ctx: SelectToolContext = {
		store,
		undoManager,
		getCamera: () => CAMERA,
		getContainerRect: () => CONTAINER_RECT,
		getSvgElement: () => null,
		getSelectionOverlayElement: () => null,
		getSelectedStrokeIds: () => selectedIds,
		setSelectedStrokeIds: (ids) => {
			selectedIds = ids;
		},
		getSelectionChrome: () => selectionChrome,
		setSelectionChrome: (chrome) => {
			selectionChrome = chrome;
		},
		setSelectionPreview: () => {},
		writingMode: true,
		getDominantHand: () => 'right',
	};

	return {
		ctx,
		getSelected: () => selectedIds,
	};
}

const selectionBounds: StrokeBounds = {
	minX: 0,
	minY: 0,
	maxX: 100,
	maxY: 50,
	width: 100,
	height: 50,
};

afterEach(() => {
	selectToolPointerCancel(pointerEvent(0, 0), buildSelectContext({ selectedIds: new Set() }).ctx);
});

describe('select tool tap gesture', () => {
	test('short tap outside selection chrome clears the selection', () => {
		const { ctx, getSelected } = buildSelectContext({
			selectedIds: new Set(['stroke-a']),
			chromeBounds: selectionBounds,
		});

		const outsideClientX = 250;
		const outsideClientY = 250;

		selectToolPointerDown(pointerEvent(outsideClientX, outsideClientY), ctx);
		selectToolPointerUp(pointerEvent(outsideClientX, outsideClientY), ctx);

		expect(getSelected().size).toBe(0);
	});

	test('short tap with many pointer moves under threshold still clears when outside chrome', () => {
		const { ctx, getSelected } = buildSelectContext({
			selectedIds: new Set(['stroke-a']),
			chromeBounds: selectionBounds,
		});

		const startX = 250;
		const startY = 250;
		const wiggle = SELECT_STROKE_DRAG_THRESHOLD_SCREEN_PX - 2;

		selectToolPointerDown(pointerEvent(startX, startY), ctx);
		selectToolPointerMove(pointerEvent(startX + 1, startY), ctx);
		selectToolPointerMove(pointerEvent(startX + 2, startY + 1), ctx);
		selectToolPointerMove(pointerEvent(startX + wiggle, startY), ctx);
		selectToolPointerUp(pointerEvent(startX + wiggle, startY), ctx);

		expect(getSelected().size).toBe(0);
	});

	test('long lasso gesture does not clear selection when no strokes are hit', () => {
		const { ctx, getSelected } = buildSelectContext({
			selectedIds: new Set(['stroke-a']),
			chromeBounds: selectionBounds,
		});

		const startX = 300;
		const startY = 300;
		const far = startX + SELECT_STROKE_DRAG_THRESHOLD_SCREEN_PX + 20;

		selectToolPointerDown(pointerEvent(startX, startY), ctx);
		selectToolPointerMove(pointerEvent(far, startY), ctx);
		selectToolPointerMove(pointerEvent(far, far), ctx);
		selectToolPointerMove(pointerEvent(startX, far), ctx);
		selectToolPointerUp(pointerEvent(startX, far), ctx);

		expect(getSelected().has('stroke-a')).toBe(true);
	});
});
