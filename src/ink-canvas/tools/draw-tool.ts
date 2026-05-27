import { getSvgPathFromStroke } from '../utils/svg-path-from-stroke';
import { getPointerSamples } from '../utils/pointer-samples';
import { screenToPage } from '../camera';
import { AddStrokeCommand } from '../commands';
import type { StrokeStore } from '../stroke-store';
import type { UndoManager } from '../undo-manager';
import type { StrokeInputTreatAs } from 'src/logic/device-settings/device-settings-types';
import type { CameraState, InkPoint, InkStroke, InkStrokeStyle } from '../types';
import { toStrokeOptions } from '../types';
import { buildInkStrokeStyleForTreatAs } from '../stroke-presets';
import { getInkStrokeOutline } from '../freehand/get-ink-stroke-outline';
import {
	normalizePointerPenPressureForCapture,
	PEN_HOVER_PRESSURE_EPSILON,
	PEN_PRESSURE_SMOOTHING_ALPHA,
} from '../constants/pen-input';

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
	/** Device-local “Treat input as” for pen vs mouse presets and pressure handling. */
	getStrokeInputTreatAs: () => StrokeInputTreatAs;
	getLiveStrokePath: () => SVGPathElement | null;
	onStrokeComplete?: () => void;
}

interface ActiveStroke {
	id: string;
	points: InkPoint[];
	style: InkStrokeStyle;
	/** Page-space length along the stroke path (for early-stroke pressure floor). */
	strokePathLength: number;
	/** Last EMA output for pen pressure; do not smooth across strokes. */
	lastSmoothedPenPressure: number;
}

let activeStroke: ActiveStroke | null = null;

function isHardwarePen(e: PointerEvent): boolean {
	return e.pointerType === 'pen';
}

export function drawToolPointerDown(e: PointerEvent, ctx: DrawToolContext): void {
	const treatAs = ctx.getStrokeInputTreatAs();
	const treatAsPen = treatAs === 'pen';
	const camera = ctx.getCamera();
	const containerRect = ctx.getContainerRect();
	const pagePoint = screenToPage(camera, containerRect, e.clientX, e.clientY);

	let pressure = e.pressure;
	if (!treatAsPen && pressure === 0) pressure = 0.5;
	if (isHardwarePen(e)) {
		pressure = normalizePointerPenPressureForCapture(e.pressure, 0, ctx.getStrokeStyle().size);
	}

	const baseStyle = ctx.getStrokeStyle();
	const style = buildInkStrokeStyleForTreatAs(baseStyle, treatAs);

	activeStroke = {
		id: generateStrokeId(),
		points: [[pagePoint.x, pagePoint.y, pressure]],
		style: { ...style },
		strokePathLength: 0,
		lastSmoothedPenPressure: pressure,
	};

	updateLiveStrokePath(ctx);
}

export function drawToolPointerMove(e: PointerEvent, ctx: DrawToolContext): void {
	if (!activeStroke) return;
	appendDrawSamplesFromPointerEvent(e, ctx, { forceCommitFinalPoint: false });
}

export function drawToolPointerUp(e: PointerEvent, ctx: DrawToolContext): void {
	if (!activeStroke) return;

	// Final segment: coalesced samples on `pointerup` can include the true lift position.
	appendDrawSamplesFromPointerEvent(e, ctx, { forceCommitFinalPoint: true });

	const stroke: InkStroke = {
		id: activeStroke.id,
		authoringSource: 'local',
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

function appendDrawSamplesFromPointerEvent(
	e: PointerEvent,
	ctx: DrawToolContext,
	options: { forceCommitFinalPoint: boolean },
): void {
	if (!activeStroke) return;

	const camera = ctx.getCamera();
	const containerRect = ctx.getContainerRect();
	const samples = getPointerSamples(e);
	const treatAsPen = ctx.getStrokeInputTreatAs() === 'pen';
	const mergeThresholdPage = 1 / camera.zoom;
	const hardwarePen = isHardwarePen(e);
	const alpha = PEN_PRESSURE_SMOOTHING_ALPHA;

	const lastSampleIdx = samples.length - 1;
	for (let i = 0; i < samples.length; i++) {
		const sample = samples[i];
		const sampleIsPen = sample.pointerType === 'pen' || hardwarePen;

		if (
			sampleIsPen
			&& !options.forceCommitFinalPoint
			&& sample.pressure <= PEN_HOVER_PRESSURE_EPSILON
		) {
			continue;
		}

		const pagePoint = screenToPage(camera, containerRect, sample.clientX, sample.clientY);

		let pressure = sample.pressure;
		if (!treatAsPen && pressure === 0) pressure = 0.5;

		if (sampleIsPen) {
			pressure = normalizePointerPenPressureForCapture(
				sample.pressure,
				activeStroke.strokePathLength,
				activeStroke.style.size,
			);
			const last = activeStroke.points[activeStroke.points.length - 1];
			const dx = pagePoint.x - last[0];
			const dy = pagePoint.y - last[1];
			const willMerge =
				dx * dx + dy * dy < mergeThresholdPage * mergeThresholdPage
				&& activeStroke.points.length > 0
				&& !(options.forceCommitFinalPoint && i === lastSampleIdx);

			if (willMerge) {
				pressure = Math.max(last[2], pressure);
				activeStroke.lastSmoothedPenPressure = pressure;
			} else if (alpha > 0) {
				const prevSmoothed = activeStroke.lastSmoothedPenPressure;
				pressure = prevSmoothed + (pressure - prevSmoothed) * alpha;
				activeStroke.lastSmoothedPenPressure = pressure;
			} else {
				activeStroke.lastSmoothedPenPressure = pressure;
			}
		}

		const nextPoint: InkPoint = [pagePoint.x, pagePoint.y, pressure];

		const isLastSample = i === lastSampleIdx;
		if (options.forceCommitFinalPoint && isLastSample) {
			setOrAppendLastPoint(activeStroke, nextPoint);
		} else {
			appendOrMergePoint(activeStroke, nextPoint, mergeThresholdPage);
		}
	}

	updateLiveStrokePath(ctx);
}

function appendOrMergePoint(stroke: ActiveStroke, next: InkPoint, mergeThresholdPage: number): void {
	const points = stroke.points;
	if (points.length === 0) {
		points.push(next);
		return;
	}

	const last = points[points.length - 1];
	const dx = next[0] - last[0];
	const dy = next[1] - last[1];
	const dist = Math.hypot(dx, dy);
	if (dx * dx + dy * dy < mergeThresholdPage * mergeThresholdPage) {
		// Preserve the higher pressure when merging; avoids thin “gaps” on quick pen strokes.
		points[points.length - 1] = [next[0], next[1], Math.max(last[2], next[2])];
		stroke.strokePathLength += dist;
	} else {
		points.push(next);
		stroke.strokePathLength += dist;
	}
}

function setOrAppendLastPoint(stroke: ActiveStroke, next: InkPoint): void {
	const points = stroke.points;
	if (points.length === 0) {
		points.push(next);
		return;
	}

	// Do not grow the point list on pointerup; just ensure the stroke terminates at the lift position.
	const last = points[points.length - 1];
	const dx = next[0] - last[0];
	const dy = next[1] - last[1];
	const dist = Math.hypot(dx, dy);
	points[points.length - 1] = [next[0], next[1], Math.max(last[2], next[2])];
	stroke.strokePathLength += dist;
}

/** Imperatively update the live stroke <path> element (no React re-render). */
function updateLiveStrokePath(ctx: DrawToolContext): void {
	if (!activeStroke) return;
	const livePath = ctx.getLiveStrokePath();
	if (!livePath) return;

	const outlinePoints = getInkStrokeOutline(activeStroke.points, {
		...toStrokeOptions(activeStroke.style),
		last: false, // stroke still in progress
	});
	const pathData = getSvgPathFromStroke(outlinePoints);
	livePath.setAttribute('d', pathData);
	livePath.setAttribute('fill', activeStroke.style.color);
}
