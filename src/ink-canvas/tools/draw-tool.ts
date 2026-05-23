import { getStroke } from 'perfect-freehand';
import { getSvgPathFromStroke } from '../utils/svg-path-from-stroke';
import { screenToPage } from '../camera';
import { AddStrokeCommand } from '../commands';
import type { StrokeStore } from '../stroke-store';
import type { UndoManager } from '../undo-manager';
import type { CameraState, InkPoint, InkStroke, InkStrokeStyle } from '../types';
import { toStrokeOptions } from '../types';

///////////////////////////
///////////////////////////

let idCounter = 0;
function generateStrokeId(): string {
	return `s_${Date.now()}_${idCounter++}`;
}

export interface DrawToolContext {
	store: StrokeStore;
	undoManager: UndoManager;
	getCamera: () => CameraState;
	getContainerRect: () => DOMRect;
	getStrokeStyle: () => InkStrokeStyle;
	getLiveStrokePath: () => SVGPathElement | null;
	onStrokeComplete?: () => void;
}

interface ActiveStroke {
	id: string;
	points: InkPoint[];
	style: InkStrokeStyle;
}

let activeStroke: ActiveStroke | null = null;

export function drawToolPointerDown(e: PointerEvent, ctx: DrawToolContext): void {
	const isPen = e.pointerType === 'pen';
	const camera = ctx.getCamera();
	const containerRect = ctx.getContainerRect();
	const pagePoint = screenToPage(camera, containerRect, e.clientX, e.clientY);

	let pressure = e.pressure;
	if (!isPen && pressure === 0) pressure = 0.5;

	const style = ctx.getStrokeStyle();
	if (isPen) {
		// Use real pressure for pen/stylus
		style.simulatePressure = false;
	} else {
		// Simulate pressure for mouse
		style.simulatePressure = true;
	}

	activeStroke = {
		id: generateStrokeId(),
		points: [[pagePoint.x, pagePoint.y, pressure]],
		style: { ...style },
	};

	updateLiveStrokePath(ctx);
}

export function drawToolPointerMove(e: PointerEvent, ctx: DrawToolContext): void {
	if (!activeStroke) return;

	const camera = ctx.getCamera();
	const containerRect = ctx.getContainerRect();
	const pagePoint = screenToPage(camera, containerRect, e.clientX, e.clientY);

	let pressure = e.pressure;
	const isPen = e.pointerType === 'pen';
	if (!isPen && pressure === 0) pressure = 0.5;

	activeStroke.points.push([pagePoint.x, pagePoint.y, pressure]);

	// Imperative DOM update — no React re-render during drawing
	updateLiveStrokePath(ctx);
}

export function drawToolPointerUp(_e: PointerEvent, ctx: DrawToolContext): void {
	if (!activeStroke) return;

	const stroke: InkStroke = {
		id: activeStroke.id,
		points: activeStroke.points,
		style: activeStroke.style,
		offset: { x: 0, y: 0 },
	};

	const command = new AddStrokeCommand(ctx.store, stroke);
	ctx.undoManager.execute(command);

	// Clear live stroke
	const livePath = ctx.getLiveStrokePath();
	if (livePath) livePath.setAttribute('d', '');

	activeStroke = null;
	ctx.onStrokeComplete?.();
}

export function drawToolPointerCancel(_e: PointerEvent, ctx: DrawToolContext): void {
	// Discard the in-progress stroke
	const livePath = ctx.getLiveStrokePath();
	if (livePath) livePath.setAttribute('d', '');
	activeStroke = null;
}

export function isDrawToolActive(): boolean {
	return activeStroke !== null;
}


// Helpers
///////////////////////////

/** Imperatively update the live stroke <path> element (no React re-render). */
function updateLiveStrokePath(ctx: DrawToolContext): void {
	if (!activeStroke) return;
	const livePath = ctx.getLiveStrokePath();
	if (!livePath) return;

	const outlinePoints = getStroke(activeStroke.points, {
		...toStrokeOptions(activeStroke.style),
		last: false, // stroke still in progress
	});
	const pathData = getSvgPathFromStroke(outlinePoints);
	livePath.setAttribute('d', pathData);
	livePath.setAttribute('fill', activeStroke.style.color);
}
