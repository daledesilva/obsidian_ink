import { screenToPage } from '../camera';
import { MoveStrokesCommand, TransformStrokesCommand } from '../commands';
import {
	selectionBoundsPaddingPageUnits,
	SELECTION_HANDLE_HIT_RADIUS_SCREEN_PX,
	expandBoundsToMinimumSize,
	getSelectionBoundsForStrokes,
} from '../selection-bounds';
import {
	EMPTY_SELECTION_CHROME_PREVIEW,
	applyRotationToSelectionChrome,
	applyScaleToSelectionChrome,
	getChromeHandlePositions,
	hitTestChromeHandle,
	isPagePointInChrome,
	translateSelectionChrome,
	type SelectionChrome,
	type SelectionChromePreview,
} from '../selection-chrome';
import {
	rotationDeltaForDominantHand,
	scaleFactorFromPointerDistance,
	transformStrokesAroundPivot,
} from '../selection-transform';
import type { StrokeStore } from '../stroke-store';
import type { UndoManager } from '../undo-manager';
import type { CameraState, InkStroke } from '../types';
import type { StrokeBounds } from '../svg-export';
import { strokeIntersectsLassoPolygon } from '../utils/lasso-stroke-selection';
import { getStrokeIdAtClientPoint } from '../utils/stroke-hit-test';
import type { DominantHand } from 'src/types/plugin-settings_0_5_0';

///////////////////////////
///////////////////////////

export interface SelectToolContext {
	store: StrokeStore;
	undoManager: UndoManager;
	getCamera: () => CameraState;
	getContainerRect: () => DOMRect;
	getSvgElement: () => SVGSVGElement | null;
	getSelectionOverlayElement: () => SVGGElement | null;
	getSelectedStrokeIds: () => Set<string>;
	setSelectedStrokeIds: (ids: Set<string>) => void;
	getSelectionChrome: () => SelectionChrome | null;
	setSelectionChrome: (chrome: SelectionChrome | null) => void;
	setSelectionPreview: (preview: SelectionChromePreview | null) => void;
	writingMode: boolean;
	getDominantHand: () => DominantHand;
	onSelectionChange?: () => void;
}

// Pointer-down picks a phase once; pointer-up commits MoveStrokesCommand or TransformStrokesCommand.
// Resize/rotate handles are drawing-only (writingMode false) — see docs/ink-canvas-selection.md.
type SelectPhase = 'idle' | 'lasso' | 'dragging' | 'resizing' | 'rotating';

let phase: SelectPhase = 'idle';

let lassoPoints: Array<{ x: number; y: number }> = [];

let dragStartPage: { x: number; y: number } | null = null;
let dragAccumulatedDelta = { x: 0, y: 0 };

let transformPivot: { x: number; y: number } | null = null;
let transformStartPage: { x: number; y: number } | null = null;
let transformPreviewScale = 1;
let transformPreviewRotationRad = 0;
let transformBaseOffsets = new Map<string, { x: number; y: number }>();

/** Screen px before a press on a selected stroke becomes a move instead of toggle-off. */
const SELECT_STROKE_DRAG_THRESHOLD_SCREEN_PX = 6;
let strokeDragCandidateId: string | null = null;
let strokeDragCandidateStartClient: { x: number; y: number } | null = null;

const MIN_BOUNDS_PAGE_FOR_HANDLES = 24;


export function selectToolPointerDown(e: PointerEvent, ctx: SelectToolContext): void {
	const camera = ctx.getCamera();
	const containerRect = ctx.getContainerRect();
	const pagePoint = screenToPage(camera, containerRect, e.clientX, e.clientY);

	const selected = ctx.getSelectedStrokeIds();
	const tolerancePage = SELECTION_HANDLE_HIT_RADIUS_SCREEN_PX / camera.zoom;

	const chrome = ctx.getSelectionChrome();

	if (!ctx.writingMode && selected.size > 0 && chrome) {
		const handleHit = hitTestChromeHandle(
			pagePoint,
			chrome,
			ctx.getDominantHand(),
			tolerancePage,
		);
		if (handleHit === 'resize') {
			const handles = getChromeHandlePositions(chrome, ctx.getDominantHand());
			beginTransformGesture(ctx, 'resizing', pagePoint, handles.pivot);
			return;
		}
		if (handleHit === 'rotate') {
			const handles = getChromeHandlePositions(chrome, ctx.getDominantHand());
			beginTransformGesture(ctx, 'rotating', pagePoint, handles.pivot);
			return;
		}
	}

	if (selected.size > 0) {
		if (chrome && isPagePointInChrome(pagePoint, chrome)) {
			phase = 'dragging';
			dragStartPage = pagePoint;
			dragAccumulatedDelta = { x: 0, y: 0 };
			return;
		}

	}

	phase = 'lasso';
	lassoPoints = [pagePoint];
	strokeDragCandidateId = null;
	strokeDragCandidateStartClient = null;

	const hitId = hitTestSingleStroke(e, ctx);
	if (hitId && selected.has(hitId)) {
		// Short press toggles off; movement promotes to drag (see lasso pointermove).
		strokeDragCandidateId = hitId;
		strokeDragCandidateStartClient = { x: e.clientX, y: e.clientY };
	}
}

export function selectToolPointerMove(e: PointerEvent, ctx: SelectToolContext): void {
	if (phase === 'lasso') {
		if (
			strokeDragCandidateId
			&& strokeDragCandidateStartClient
			&& lassoPoints.length > 0
		) {
			const dx = e.clientX - strokeDragCandidateStartClient.x;
			const dy = e.clientY - strokeDragCandidateStartClient.y;
			if (Math.hypot(dx, dy) >= SELECT_STROKE_DRAG_THRESHOLD_SCREEN_PX) {
				const camera = ctx.getCamera();
				const containerRect = ctx.getContainerRect();
				const pagePoint = screenToPage(camera, containerRect, e.clientX, e.clientY);
				phase = 'dragging';
				dragStartPage = pagePoint;
				dragAccumulatedDelta = { x: 0, y: 0 };
				strokeDragCandidateId = null;
				strokeDragCandidateStartClient = null;
				clearLassoVisual(ctx);
				lassoPoints = [];
				return;
			}
		}

		const camera = ctx.getCamera();
		const containerRect = ctx.getContainerRect();
		const pagePoint = screenToPage(camera, containerRect, e.clientX, e.clientY);
		lassoPoints.push(pagePoint);
		updateLassoVisual(ctx);
		return;
	}

	if (phase === 'dragging') {
		const camera = ctx.getCamera();
		const containerRect = ctx.getContainerRect();
		const pagePoint = screenToPage(camera, containerRect, e.clientX, e.clientY);
		if (!dragStartPage) return;

		const dx = pagePoint.x - dragStartPage.x;
		const dy = pagePoint.y - dragStartPage.y;

		const delta = {
			x: dx - dragAccumulatedDelta.x,
			y: dy - dragAccumulatedDelta.y,
		};
		moveSelectionVisuals(ctx, delta.x, delta.y);
		dragAccumulatedDelta = { x: dx, y: dy };
		publishSelectionPreview(ctx);
		return;
	}

	if (phase === 'resizing' || phase === 'rotating') {
		const camera = ctx.getCamera();
		const containerRect = ctx.getContainerRect();
		const pagePoint = screenToPage(camera, containerRect, e.clientX, e.clientY);
		if (!transformPivot || !transformStartPage) return;

		if (phase === 'resizing') {
			transformPreviewScale = scaleFactorFromPointerDistance(
				transformPivot,
				transformStartPage,
				pagePoint,
			);
			transformPreviewRotationRad = 0;
		} else {
			transformPreviewRotationRad = rotationDeltaForDominantHand(
				ctx.getDominantHand(),
				transformPivot,
				transformStartPage,
				pagePoint,
			);
			transformPreviewScale = 1;
		}
		applyTransformPreviewToDom(ctx);
		publishSelectionPreview(ctx);
		return;
	}
}

function publishSelectionPreview(ctx: SelectToolContext): void {
	if (phase === 'dragging') {
		ctx.setSelectionPreview({
			...EMPTY_SELECTION_CHROME_PREVIEW,
			translateX: dragAccumulatedDelta.x,
			translateY: dragAccumulatedDelta.y,
		});
		return;
	}
	if (phase === 'resizing' || phase === 'rotating') {
		ctx.setSelectionPreview({
			scale: transformPreviewScale,
			rotationRad: transformPreviewRotationRad,
			translateX: 0,
			translateY: 0,
		});
	}
}

export function selectToolPointerUp(_e: PointerEvent, ctx: SelectToolContext): void {
	if (phase === 'lasso') {
		finishLasso(_e, ctx);
		phase = 'idle';
		return;
	}

	if (phase === 'dragging') {
		finishDrag(ctx);
		phase = 'idle';
		return;
	}

	if (phase === 'resizing' || phase === 'rotating') {
		finishTransform(ctx);
		phase = 'idle';
		return;
	}
}

export function selectToolPointerCancel(_e: PointerEvent, ctx: SelectToolContext): void {
	if (phase === 'dragging' || phase === 'resizing' || phase === 'rotating') {
		revertSelectionVisuals(ctx);
	}
	phase = 'idle';
	lassoPoints = [];
	dragStartPage = null;
	dragAccumulatedDelta = { x: 0, y: 0 };
	strokeDragCandidateId = null;
	strokeDragCandidateStartClient = null;
	resetTransformGestureState();
	clearLassoVisual(ctx);
}

export function isSelectToolActive(): boolean {
	return phase !== 'idle';
}


// Selection bounds
///////////////////////////

function getSelectedStrokes(ctx: SelectToolContext): InkStroke[] {
	const ids = ctx.getSelectedStrokeIds();
	const strokes: InkStroke[] = [];
	for (const id of ids) {
		const stroke = ctx.store.getById(id);
		if (stroke) strokes.push(stroke);
	}
	return strokes;
}

export function getContextSelectionBounds(ctx: SelectToolContext): StrokeBounds | null {
	const strokes = getSelectedStrokes(ctx);
	const paddingPage = selectionBoundsPaddingPageUnits(ctx.getCamera().zoom);
	const bounds = getSelectionBoundsForStrokes(strokes, paddingPage);
	if (!bounds) return null;
	const minSize = MIN_BOUNDS_PAGE_FOR_HANDLES / ctx.getCamera().zoom;
	return expandBoundsToMinimumSize(bounds, minSize);
}


// Lasso helpers
///////////////////////////

function finishLasso(e: PointerEvent, ctx: SelectToolContext): void {
	if (lassoPoints.length < 3) {
		handleTapSelect(e, ctx);
		clearLassoVisual(ctx);
		lassoPoints = [];
		return;
	}

	const allStrokes = ctx.store.getAll();
	const selected = new Set(ctx.getSelectedStrokeIds());

	for (const stroke of allStrokes) {
		if (!strokeIntersectsLassoPolygon(stroke, lassoPoints)) continue;
		if (selected.has(stroke.id)) selected.delete(stroke.id);
		else selected.add(stroke.id);
	}

	ctx.setSelectedStrokeIds(selected);
	ctx.onSelectionChange?.();

	clearLassoVisual(ctx);
	lassoPoints = [];
	strokeDragCandidateId = null;
	strokeDragCandidateStartClient = null;
}

function handleTapSelect(e: PointerEvent, ctx: SelectToolContext): void {
	const next = new Set(ctx.getSelectedStrokeIds());

	if (strokeDragCandidateId) {
		next.delete(strokeDragCandidateId);
		strokeDragCandidateId = null;
		strokeDragCandidateStartClient = null;
		ctx.setSelectedStrokeIds(next);
		ctx.onSelectionChange?.();
		return;
	}

	const hitId = hitTestSingleStroke(e, ctx);

	if (hitId) {
		if (next.has(hitId)) next.delete(hitId);
		else next.add(hitId);
		ctx.setSelectedStrokeIds(next);
		ctx.onSelectionChange?.();
		return;
	}

	ctx.setSelectedStrokeIds(new Set());
	ctx.onSelectionChange?.();
}

function updateLassoVisual(ctx: SelectToolContext): void {
	const svg = ctx.getSvgElement();
	if (!svg) return;

	let lassoEl = svg.querySelector<SVGPolygonElement>('.ink-canvas-lasso');
	if (!lassoEl) {
		lassoEl = svg.createSvg('polygon');
		lassoEl.classList.add('ink-canvas-lasso');
		lassoEl.setAttribute('fill', 'color-mix(in srgb, var(--interactive-accent) 14%, transparent)');
		lassoEl.setAttribute('stroke', 'var(--interactive-accent)');
		lassoEl.setAttribute('stroke-width', '1');
		lassoEl.setAttribute('stroke-dasharray', '4 2');
	}

	const camera = ctx.getCamera();
	const pointsStr = lassoPoints
		.map(p => `${(p.x + camera.x) * camera.zoom},${(p.y + camera.y) * camera.zoom}`)
		.join(' ');
	lassoEl.setAttribute('points', pointsStr);
}

function clearLassoVisual(ctx: SelectToolContext): void {
	const svg = ctx.getSvgElement();
	if (!svg) return;
	const lassoEl = svg.querySelector('.ink-canvas-lasso');
	if (lassoEl) lassoEl.remove();
}


// Drag helpers
///////////////////////////

function finishDrag(ctx: SelectToolContext): void {
	if (dragAccumulatedDelta.x === 0 && dragAccumulatedDelta.y === 0) {
		ctx.setSelectionPreview(null);
		dragStartPage = null;
		return;
	}

	const selected = ctx.getSelectedStrokeIds();
	if (selected.size === 0) {
		ctx.setSelectionPreview(null);
		dragStartPage = null;
		return;
	}

	const ids = Array.from(selected);
	const command = new MoveStrokesCommand(
		ctx.store,
		ids,
		dragAccumulatedDelta.x,
		dragAccumulatedDelta.y,
	);
	ctx.undoManager.execute(command);

	const chrome = ctx.getSelectionChrome();
	if (chrome) {
		ctx.setSelectionChrome(translateSelectionChrome(
			chrome,
			dragAccumulatedDelta.x,
			dragAccumulatedDelta.y,
		));
	}

	ctx.setSelectionPreview(null);
	syncStrokeGroupTransformsFromStore(ctx, ids);
	dragStartPage = null;
	dragAccumulatedDelta = { x: 0, y: 0 };
}

function moveSelectionVisuals(ctx: SelectToolContext, dx: number, dy: number): void {
	const svg = ctx.getSvgElement();
	if (!svg) return;

	const selected = ctx.getSelectedStrokeIds();
	for (const id of selected) {
		const group = svg.querySelector<SVGGElement>(`[data-stroke-group][data-stroke-id="${id}"]`);
		if (!group) continue;

		const currentX = parseFloat(group.getAttribute('data-offset-x') || '0');
		const currentY = parseFloat(group.getAttribute('data-offset-y') || '0');
		const newX = currentX + dx;
		const newY = currentY + dy;
		group.setAttribute('transform', `translate(${newX}, ${newY})`);
		group.setAttribute('data-offset-x', String(newX));
		group.setAttribute('data-offset-y', String(newY));
	}

}


// Transform (scale / rotate) helpers
///////////////////////////

function beginTransformGesture(
	ctx: SelectToolContext,
	nextPhase: 'resizing' | 'rotating',
	pagePoint: { x: number; y: number },
	pivot: { x: number; y: number },
): void {
	phase = nextPhase;
	transformPivot = pivot;
	transformStartPage = pagePoint;
	transformPreviewScale = 1;
	transformPreviewRotationRad = 0;
	transformBaseOffsets = new Map();
	ctx.setSelectionPreview({ ...EMPTY_SELECTION_CHROME_PREVIEW });
	for (const id of ctx.getSelectedStrokeIds()) {
		const stroke = ctx.store.getById(id);
		if (!stroke) continue;
		transformBaseOffsets.set(id, { ...stroke.offset });
	}
}

function resetTransformGestureState(): void {
	transformPivot = null;
	transformStartPage = null;
	transformPreviewScale = 1;
	transformPreviewRotationRad = 0;
	transformBaseOffsets = new Map();
}

function buildPivotTransformAttribute(
	pivot: { x: number; y: number },
	scale: number,
	rotationRad: number,
	offsetX: number,
	offsetY: number,
): string {
	const rotateDeg = (rotationRad * 180) / Math.PI;
	return [
		`translate(${pivot.x}, ${pivot.y})`,
		`rotate(${rotateDeg})`,
		`scale(${scale})`,
		`translate(${-pivot.x}, ${-pivot.y})`,
		`translate(${offsetX}, ${offsetY})`,
	].join(' ');
}

function applyTransformPreviewToDom(ctx: SelectToolContext): void {
	const svg = ctx.getSvgElement();
	if (!svg || !transformPivot) return;

	const scale = transformPreviewScale;
	const rotationRad = transformPreviewRotationRad;

	for (const id of ctx.getSelectedStrokeIds()) {
		const group = svg.querySelector<SVGGElement>(`[data-stroke-group][data-stroke-id="${id}"]`);
		const baseOffset = transformBaseOffsets.get(id);
		if (!group || !baseOffset) continue;
		group.setAttribute(
			'transform',
			buildPivotTransformAttribute(
				transformPivot,
				scale,
				rotationRad,
				baseOffset.x,
				baseOffset.y,
			),
		);
	}

}

function finishTransform(ctx: SelectToolContext): void {
	const selectedIds = Array.from(ctx.getSelectedStrokeIds());
	const strokes = getSelectedStrokes(ctx);
	const pivot = transformPivot;

	const isNoOp = transformPreviewScale === 1 && transformPreviewRotationRad === 0;
	if (!pivot || isNoOp || strokes.length === 0) {
		ctx.setSelectionPreview(null);
		revertSelectionVisuals(ctx);
		return;
	}

	const nextStrokes = transformStrokesAroundPivot(
		strokes,
		pivot,
		transformPreviewScale,
		transformPreviewRotationRad,
	);
	const command = new TransformStrokesCommand(ctx.store, nextStrokes);
	ctx.undoManager.execute(command);

	const chrome = ctx.getSelectionChrome();
	if (chrome) {
		let nextChrome = chrome;
		if (transformPreviewScale !== 1) {
			nextChrome = applyScaleToSelectionChrome(nextChrome, transformPreviewScale);
		}
		if (transformPreviewRotationRad !== 0) {
			nextChrome = applyRotationToSelectionChrome(nextChrome, transformPreviewRotationRad);
		}
		ctx.setSelectionChrome(nextChrome);
	}

	ctx.setSelectionPreview(null);
	syncStrokeGroupTransformsFromStore(ctx, selectedIds);
	resetTransformGestureState();
}

function revertSelectionVisuals(ctx: SelectToolContext): void {
	const ids = Array.from(ctx.getSelectedStrokeIds());
	ctx.setSelectionPreview(null);
	syncStrokeGroupTransformsFromStore(ctx, ids);
	resetTransformGestureState();
	dragStartPage = null;
	dragAccumulatedDelta = { x: 0, y: 0 };
}

function syncStrokeGroupTransformsFromStore(ctx: SelectToolContext, ids: string[]): void {
	const svg = ctx.getSvgElement();
	if (!svg) return;

	for (const id of ids) {
		const stroke = ctx.store.getById(id);
		const group = svg.querySelector<SVGGElement>(`[data-stroke-group][data-stroke-id="${id}"]`);
		if (!stroke || !group) continue;
		const ox = stroke.offset.x;
		const oy = stroke.offset.y;
		group.setAttribute('data-offset-x', String(ox));
		group.setAttribute('data-offset-y', String(oy));
		if (ox !== 0 || oy !== 0) {
			group.setAttribute('transform', `translate(${ox}, ${oy})`);
		} else {
			group.removeAttribute('transform');
		}
	}
}


// Hit-test helper
///////////////////////////

function hitTestSingleStroke(e: PointerEvent, ctx: SelectToolContext): string | null {
	const svg = ctx.getSvgElement();
	if (!svg) return null;

	return getStrokeIdAtClientPoint(svg, e.clientX, e.clientY);
}
