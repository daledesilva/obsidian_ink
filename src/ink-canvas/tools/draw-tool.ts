import { getStroke } from 'perfect-freehand';
import { getSvgPathFromStroke } from '../utils/svg-path-from-stroke';
import { getPointerSamples } from '../utils/pointer-samples';
import { screenToPage } from '../camera';
import { AddStrokeCommand } from '../commands';
import type { StrokeStore } from '../stroke-store';
import type { UndoManager } from '../undo-manager';
import { detectStrokeInputFromRawPressures } from 'src/logic/device-settings/detect-stroke-input-from-pressures';
import type { ResolvedStrokeInputTreatAs } from 'src/logic/device-settings/device-settings-types';
import type { CameraState, InkPoint, InkStroke, InkStrokeStyle } from '../types';
import { toStrokeOptions } from '../types';
import { buildInkStrokeStyleForTreatAs } from '../stroke-presets';
import {
	normalizePointerPenPressureForCapture,
	PEN_HOVER_PRESSURE_EPSILON,
	PEN_PRESSURE_SLEW_PER_SIZE,
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
	/** Resolved pen vs mouse presets and pressure handling (never `'auto'`). */
	getResolvedStrokeInputTreatAs: () => ResolvedStrokeInputTreatAs;
	getLiveStrokePath: () => SVGPathElement | null;
	onStrokeInputDetected?: (detected: ResolvedStrokeInputTreatAs) => void;
	onStrokeComplete?: () => void;
}

interface ActiveStroke {
	id: string;
	/**
	 * The single source of geometry — persisted on pointer up AND rendered live.
	 * Live preview and the committed stroke render this same array through the same
	 * outline pipeline, so what you draw is exactly what gets stored (WYSIWYG).
	 */
	points: InkPoint[];
	style: InkStrokeStyle;
	/** Epoch ms when pointer down started this stroke. */
	startedAt: number;
	/** Page-space length along the stroke path (for early-stroke pressure floor). */
	strokePathLength: number;
	/** Last EMA output for pen pressure; do not smooth across strokes. */
	lastSmoothedPenPressure: number;
	/** Raw pointer pressures for auto-detect (before normalization or fallback). */
	rawPointerPressures: number[];
}

let activeStroke: ActiveStroke | null = null;

function isHardwarePen(e: PointerEvent): boolean {
	return e.pointerType === 'pen';
}

export function drawToolPointerDown(e: PointerEvent, ctx: DrawToolContext): void {
	const treatAs = ctx.getResolvedStrokeInputTreatAs();
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
	const style = buildInkStrokeStyleForTreatAs(baseStyle, treatAs, camera.zoom);

	const firstPoint: InkPoint = [pagePoint.x, pagePoint.y, pressure];
	activeStroke = {
		id: generateStrokeId(),
		points: [copyInkPoint(firstPoint)],
		style: { ...style },
		startedAt: Date.now(),
		strokePathLength: 0,
		lastSmoothedPenPressure: pressure,
		rawPointerPressures: [e.pressure],
	};

	updateLiveStrokePath(ctx);
}

export function drawToolPointerMove(e: PointerEvent, ctx: DrawToolContext): void {
	if (!activeStroke) return;
	appendDrawSamplesFromPointerEvent(e, ctx, { forceCommitFinalPoint: false });
}

export function drawToolPointerUp(e: PointerEvent, ctx: DrawToolContext): void {
	if (!activeStroke) return;

	// Final segment on `pointerup` can include the true lift position.
	appendDrawSamplesFromPointerEvent(e, ctx, { forceCommitFinalPoint: true });

	activeStroke.style = buildInkStrokeStyleForTreatAs(
		ctx.getStrokeStyle(),
		ctx.getResolvedStrokeInputTreatAs(),
		ctx.getCamera().zoom,
	);

	const detected = detectStrokeInputFromRawPressures(activeStroke.rawPointerPressures);
	ctx.onStrokeInputDetected?.(detected);

	const stroke: InkStroke = {
		id: activeStroke.id,
		authoringSource: 'local',
		points: activeStroke.points,
		style: activeStroke.style,
		offset: { x: 0, y: 0 },
		startedAt: activeStroke.startedAt,
		finishedAt: Date.now(),
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
	const treatAsPen = ctx.getResolvedStrokeInputTreatAs() === 'pen';
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
		const isLastSample = i === lastSampleIdx;

		// For mice, browsers often report `pressure=0` on the final pointerup sample.
		// Exclude that lift sample from auto-detection so a constant-pressure mouse stroke
		// remains classified as mouse.
		const isPointerUpLiftSample = options.forceCommitFinalPoint && isLastSample;
		if (!isPointerUpLiftSample) {
			activeStroke.rawPointerPressures.push(sample.pressure);
		}

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
			const segmentPageDistance = Math.hypot(dx, dy);
			const willMerge =
				dx * dx + dy * dy < mergeThresholdPage * mergeThresholdPage
				&& activeStroke.points.length > 0
				&& !(options.forceCommitFinalPoint && i === lastSampleIdx);

			if (willMerge) {
				pressure = Math.max(last[2], pressure);
				activeStroke.lastSmoothedPenPressure = pressure;
			} else {
				const prevSmoothed = activeStroke.lastSmoothedPenPressure;
				// Soft per-sample EMA (preserves existing slow-stroke feel / jitter rejection).
				const eased = alpha > 0
					? prevSmoothed + (pressure - prevSmoothed) * alpha
					: pressure;
				// Hard per-distance radius slew limit: bound how much stored pressure (→ brush
				// radius) may change per unit page travel. Prevents the outline from pinching into
				// a self-intersecting ("xor-fill") bowtie across sparse fast samples, while leaving
				// slow strokes faithful (they reach full pressure over more distance / more samples).
				const maxPressureDelta = penPressureSlewLimit(segmentPageDistance, activeStroke.style.size);
				pressure = clampNumber(eased, prevSmoothed - maxPressureDelta, prevSmoothed + maxPressureDelta);
				activeStroke.lastSmoothedPenPressure = pressure;
			}
		}

		const nextPoint: InkPoint = [pagePoint.x, pagePoint.y, pressure];

		if (options.forceCommitFinalPoint && isLastSample) {
			setOrAppendLastPoint(activeStroke, nextPoint);
		} else {
			appendOrMergePoint(activeStroke, nextPoint, mergeThresholdPage);
		}
	}

	updateLiveStrokePath(ctx);
}

function copyInkPoint(p: InkPoint): InkPoint {
	return [p[0], p[1], p[2]];
}

function clampNumber(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * Max allowed stored-pressure change for a segment of `segmentPageDistance`, given the brush size.
 * See {@link PEN_PRESSURE_SLEW_PER_SIZE}. Distances are page-space, so this is zoom-consistent.
 */
function penPressureSlewLimit(segmentPageDistance: number, strokeSizePage: number): number {
	if (strokeSizePage <= 0) return 1;
	return PEN_PRESSURE_SLEW_PER_SIZE * (segmentPageDistance / strokeSizePage);
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

	// WYSIWYG: render the live preview from the SAME `points` array, the SAME function
	// (`getStroke`), and the SAME options (`toStrokeOptions`) that `ink-svg-canvas` / export
	// use when the stroke commits — so the in-progress trail and the stored stroke are
	// byte-identical. `points` already tracks the pen tip (the last point is replaced in
	// place while within the merge radius), so there is no chord lag.
	const outlinePoints = getStroke(activeStroke.points, toStrokeOptions(activeStroke.style));
	const pathData = getSvgPathFromStroke(outlinePoints);
	livePath.setAttribute('d', pathData);
	livePath.setAttribute('fill', activeStroke.style.color);
}
