import { screenToPage } from '../camera';
import { MoveStrokesCommand } from '../commands';
import type { StrokeStore } from '../stroke-store';
import type { UndoManager } from '../undo-manager';
import type { CameraState } from '../types';
import { getStrokeIdAtClientPoint } from '../utils/stroke-hit-test';

///////////////////////////
///////////////////////////

export interface SelectToolContext {
	store: StrokeStore;
	undoManager: UndoManager;
	getCamera: () => CameraState;
	getContainerRect: () => DOMRect;
	getSvgElement: () => SVGSVGElement | null;
	getSelectedStrokeIds: () => Set<string>;
	setSelectedStrokeIds: (ids: Set<string>) => void;
	onSelectionChange?: () => void;
}

type SelectPhase = 'idle' | 'lasso' | 'dragging';

let phase: SelectPhase = 'idle';

// Lasso state
let lassoPoints: Array<{ x: number; y: number }> = [];

// Drag state
let dragStartPage: { x: number; y: number } | null = null;
let dragAccumulatedDelta = { x: 0, y: 0 };


export function selectToolPointerDown(e: PointerEvent, ctx: SelectToolContext): void {
	const camera = ctx.getCamera();
	const containerRect = ctx.getContainerRect();
	const pagePoint = screenToPage(camera, containerRect, e.clientX, e.clientY);

	const selected = ctx.getSelectedStrokeIds();

	// Check if clicking on an already-selected stroke to start a drag
	if (selected.size > 0) {
		const hitId = hitTestSingleStroke(e, ctx);
		if (hitId && selected.has(hitId)) {
			phase = 'dragging';
			dragStartPage = pagePoint;
			dragAccumulatedDelta = { x: 0, y: 0 };
			return;
		}
	}

	// Otherwise, start a lasso selection
	phase = 'lasso';
	lassoPoints = [pagePoint];

	// Clear previous selection unless Shift is held
	if (!e.shiftKey) {
		ctx.setSelectedStrokeIds(new Set());
		ctx.onSelectionChange?.();
	}
}

export function selectToolPointerMove(e: PointerEvent, ctx: SelectToolContext): void {
	if (phase === 'lasso') {
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

		// Move selection visuals imperatively
		const delta = {
			x: dx - dragAccumulatedDelta.x,
			y: dy - dragAccumulatedDelta.y,
		};
		moveSelectionVisuals(ctx, delta.x, delta.y);
		dragAccumulatedDelta = { x: dx, y: dy };
		return;
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
}

export function selectToolPointerCancel(_e: PointerEvent, ctx: SelectToolContext): void {
	phase = 'idle';
	lassoPoints = [];
	dragStartPage = null;
	clearLassoVisual(ctx);
}

export function isSelectToolActive(): boolean {
	return phase !== 'idle';
}


// Lasso helpers
///////////////////////////

function finishLasso(e: PointerEvent, ctx: SelectToolContext): void {
	if (lassoPoints.length < 3) {
		// Too few points for a lasso — treat as a click / tap select.
		// Use exact path hit testing so tapping empty space reliably deselects.
		handleTapSelect(e, ctx);
		clearLassoVisual(ctx);
		lassoPoints = [];
		return;
	}

	const allStrokes = ctx.store.getAll();
	const selected = new Set(ctx.getSelectedStrokeIds());

	for (const stroke of allStrokes) {
		const isInside = isStrokeInsideLasso(stroke, lassoPoints);
		if (isInside) selected.add(stroke.id);
	}

	ctx.setSelectedStrokeIds(selected);
	ctx.onSelectionChange?.();

	clearLassoVisual(ctx);
	lassoPoints = [];
}

function handleTapSelect(e: PointerEvent, ctx: SelectToolContext): void {
	const hitId = hitTestSingleStroke(e, ctx);
	const next = new Set(ctx.getSelectedStrokeIds());

	if (hitId) {
		if (e.shiftKey) {
			if (next.has(hitId)) next.delete(hitId);
			else next.add(hitId);
		} else {
			next.clear();
			next.add(hitId);
		}
		ctx.setSelectedStrokeIds(next);
		ctx.onSelectionChange?.();
		return;
	}

	if (!e.shiftKey) {
		ctx.setSelectedStrokeIds(new Set());
		ctx.onSelectionChange?.();
	}
}

/**
 * Check if a stroke's bounding box center is inside a lasso polygon.
 * Uses a simple ray-casting point-in-polygon test.
 */
function isStrokeInsideLasso(
	stroke: { points: Array<[number, number, number]>; offset: { x: number; y: number } },
	lasso: Array<{ x: number; y: number }>,
): boolean {
	if (stroke.points.length === 0) return false;

	// Compute the bounding box center of the stroke
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const pt of stroke.points) {
		const px = pt[0] + stroke.offset.x;
		const py = pt[1] + stroke.offset.y;
		if (px < minX) minX = px;
		if (py < minY) minY = py;
		if (px > maxX) maxX = px;
		if (py > maxY) maxY = py;
	}
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;

	return isPointInPolygon(cx, cy, lasso);
}

/** Ray-casting point-in-polygon test. */
function isPointInPolygon(
	x: number,
	y: number,
	polygon: Array<{ x: number; y: number }>,
): boolean {
	let inside = false;
	const n = polygon.length;
	for (let i = 0, j = n - 1; i < n; j = i++) {
		const xi = polygon[i].x, yi = polygon[i].y;
		const xj = polygon[j].x, yj = polygon[j].y;

		const intersect = ((yi > y) !== (yj > y))
			&& (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
		if (intersect) inside = !inside;
	}
	return inside;
}

function updateLassoVisual(ctx: SelectToolContext): void {
	const svg = ctx.getSvgElement();
	if (!svg) return;

	let lassoEl = svg.querySelector<SVGPolygonElement>('.ink-canvas-lasso');
	if (!lassoEl) {
		lassoEl = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'polygon');
		lassoEl.classList.add('ink-canvas-lasso');
		lassoEl.setAttribute('fill', 'rgba(0, 123, 255, 0.08)');
		lassoEl.setAttribute('stroke', 'rgba(0, 123, 255, 0.5)');
		lassoEl.setAttribute('stroke-width', '1');
		lassoEl.setAttribute('stroke-dasharray', '4 2');
		svg.appendChild(lassoEl);
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
		dragStartPage = null;
		return;
	}

	const selected = ctx.getSelectedStrokeIds();
	if (selected.size === 0) {
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

	dragStartPage = null;
	dragAccumulatedDelta = { x: 0, y: 0 };
}

/** Imperatively translate selected stroke group elements during drag. */
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


// Hit-test helper
///////////////////////////

function hitTestSingleStroke(e: PointerEvent, ctx: SelectToolContext): string | null {
	const svg = ctx.getSvgElement();
	if (!svg) return null;

	return getStrokeIdAtClientPoint(svg, e.clientX, e.clientY);
}
