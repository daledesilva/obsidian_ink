import { getPointerSamples } from '../utils/pointer-samples';
import { screenToPage } from '../camera';
import { AddStrokeCommand } from '../commands';
import type { StrokeStore } from '../stroke-store';
import type { UndoManager } from '../undo-manager';
import { detectStrokeInputFromRawPressures } from 'src/logic/device-settings/detect-stroke-input-from-pressures';
import type { ResolvedStrokeInputTreatAs, StrokeInputTreatAs } from 'src/logic/device-settings/device-settings-types';
import type { CameraState, InkPoint, InkStroke, InkStrokeStyle } from '../types';
import { buildInkStrokeStyleForTreatAs } from '../stroke-presets';
import {
	normalizePointerPenPressureForCapture,
	PEN_HOVER_PRESSURE_EPSILON,
	PEN_PRESSURE_SLEW_PER_SIZE,
	PEN_PRESSURE_SMOOTHING_ALPHA,
} from '../constants/pen-input';
import { clearLiveStrokeCanvas, paintLiveStrokeOnCanvas } from '../utils/live-stroke-canvas';
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
	/** User preference: auto/pen/mouse. Used to decide whether to retroactively recompute on pointerup. */
	getStrokeInputTreatAsPreference: () => StrokeInputTreatAs;
	/** Resolved pen vs mouse presets and pressure handling (never `'auto'`). */
	getResolvedStrokeInputTreatAs: () => ResolvedStrokeInputTreatAs;
	/** Transparent HTML canvas overlay for the in-progress stroke (not the SVG). */
	getLiveStrokeCanvas: () => HTMLCanvasElement | null;
	/** Host used to resolve `currentColor` / CSS vars for canvas fills. */
	getLiveStrokeColorHost: () => Element | null;
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
	/** `timeStamp` of the last committed (appended) point — used for slow-draw trail commits. */
	lastCommittedPointAtMs: number;
	rawSamples: RawStrokeSample[];
}

/** When the pen creeps slowly away from the anchor but stays near the tip, append instead of replacing. */
const SLOW_DRAW_TIP_REPLACE_APPEND_MS = 40;

let activeStroke: ActiveStroke | null = null;

interface RawStrokeSample {
	clientX: number;
	clientY: number;
	pressure: number;
	/** True only for the final sample collected on `pointerup` (the lift sample). */
	isPointerUpLiftSample: boolean;
}

function isHardwarePen(e: PointerEvent): boolean {
	return e.pointerType === 'pen';
}

function isFingerPointer(e: PointerEvent): boolean {
	return e.pointerType === 'touch';
}

/** Finger input always uses mouse-style simulated pressure, regardless of device settings. */
function getEffectiveStrokeInputTreatAs(e: PointerEvent, ctx: DrawToolContext): ResolvedStrokeInputTreatAs {
	if (isFingerPointer(e)) return 'mouse';
	return ctx.getResolvedStrokeInputTreatAs();
}

export function drawToolPointerDown(e: PointerEvent, ctx: DrawToolContext): void {
	const treatAs = getEffectiveStrokeInputTreatAs(e, ctx);
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
		lastCommittedPointAtMs: e.timeStamp,
		rawSamples: [
			{
				clientX: e.clientX,
				clientY: e.clientY,
				pressure: e.pressure,
				isPointerUpLiftSample: false,
			},
		],
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

	const isFingerStroke = isFingerPointer(e);

	if (!isFingerStroke) {
		const detected = detectStrokeInputFromRawPressures(
			activeStroke.rawSamples
				.filter((s) => !s.isPointerUpLiftSample)
				.map((s) => s.pressure),
		);
		ctx.onStrokeInputDetected?.(detected);

		const preference = ctx.getStrokeInputTreatAsPreference();
		if (preference === 'auto') {
			const recomputed = recomputeStrokeFromRawSamples({
				rawSamples: activeStroke.rawSamples,
				detected,
				camera: ctx.getCamera(),
				containerRect: ctx.getContainerRect(),
				baseStyle: ctx.getStrokeStyle(),
			});
			activeStroke.points = recomputed.points;
			activeStroke.strokePathLength = recomputed.strokePathLength;
			activeStroke.lastSmoothedPenPressure = recomputed.lastSmoothedPenPressure;
			activeStroke.style = recomputed.style;
		} else {
			activeStroke.style = buildInkStrokeStyleForTreatAs(
				ctx.getStrokeStyle(),
				ctx.getResolvedStrokeInputTreatAs(),
				ctx.getCamera().zoom,
			);
		}
	} else {
		activeStroke.style = buildInkStrokeStyleForTreatAs(
			ctx.getStrokeStyle(),
			'mouse',
			ctx.getCamera().zoom,
		);
	}

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

	// Defer clear by one frame so the new SVG StrokePath can mount first — avoids a blank
	// gap between overlay and committed ink. Same lift timing as bridge strokes (appear on up).
	const liveCanvas = ctx.getLiveStrokeCanvas();
	requestAnimationFrame(() => {
		clearLiveStrokeCanvas(liveCanvas);
	});

	activeStroke = null;
	ctx.onStrokeComplete?.();
}

export function drawToolPointerCancel(_e: PointerEvent, ctx: DrawToolContext): void {
	// Discard the in-progress stroke
	clearLiveStrokeCanvas(ctx.getLiveStrokeCanvas());
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
	const treatAsPen = getEffectiveStrokeInputTreatAs(e, ctx) === 'pen';
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
		activeStroke.rawSamples.push({
			clientX: sample.clientX,
			clientY: sample.clientY,
			pressure: sample.pressure,
			isPointerUpLiftSample,
		});

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
			const sampleTimeMs = e.timeStamp + i;
			const willMerge =
				shouldReplaceTipWithPoint(
					activeStroke.points,
					[pagePoint.x, pagePoint.y, pressure],
					mergeThresholdPage,
					sampleTimeMs,
					activeStroke.lastCommittedPointAtMs,
				)
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
			appendOrMergePoint(activeStroke, nextPoint, mergeThresholdPage, e.timeStamp + i);
		}
	}

	updateLiveStrokePath(ctx);
}

function copyInkPoint(p: InkPoint): InkPoint {
	return [p[0], p[1], p[2]];
}

function recomputeStrokeFromRawSamples(args: {
	rawSamples: RawStrokeSample[];
	detected: ResolvedStrokeInputTreatAs;
	camera: CameraState;
	containerRect: DOMRect;
	baseStyle: InkStrokeStyle;
}): { points: InkPoint[]; strokePathLength: number; lastSmoothedPenPressure: number; style: InkStrokeStyle } {
	const { rawSamples, detected, camera, containerRect, baseStyle } = args;
	const treatAsPen = detected === 'pen';
	const mergeThresholdPage = 1 / camera.zoom;
	const alpha = PEN_PRESSURE_SMOOTHING_ALPHA;

	const style = buildInkStrokeStyleForTreatAs(baseStyle, detected, camera.zoom);

	const points: InkPoint[] = [];
	let strokePathLength = 0;
	let lastSmoothedPenPressure = 0.5;
	const mergeState = { points, lastCommittedPointAtMs: 0 };
	const recomputeSampleIntervalMs = 16;

	const lastSampleIdx = rawSamples.length - 1;
	for (let i = 0; i < rawSamples.length; i++) {
		const sampleTimeMs = i * recomputeSampleIntervalMs;
		const sample = rawSamples[i];
		const isLastSample = i === lastSampleIdx;
		const pagePoint = screenToPage(camera, containerRect, sample.clientX, sample.clientY);

		let pressure = sample.pressure;
		if (!treatAsPen && pressure === 0) pressure = 0.5;

		if (treatAsPen) {
			pressure = normalizePointerPenPressureForCapture(
				sample.pressure,
				strokePathLength,
				style.size,
			);

			if (points.length > 0) {
				const last = points[points.length - 1];
				const dx = pagePoint.x - last[0];
				const dy = pagePoint.y - last[1];
				const segmentPageDistance = Math.hypot(dx, dy);
				const willMerge =
					shouldReplaceTipWithPoint(
						points,
						[pagePoint.x, pagePoint.y, pressure],
						mergeThresholdPage,
						sampleTimeMs,
						mergeState.lastCommittedPointAtMs,
					)
					&& !isLastSample;

				if (willMerge) {
					pressure = Math.max(last[2], pressure);
					lastSmoothedPenPressure = pressure;
				} else {
					const prevSmoothed = lastSmoothedPenPressure;
					const eased = alpha > 0
						? prevSmoothed + (pressure - prevSmoothed) * alpha
						: pressure;
					const maxPressureDelta = penPressureSlewLimit(segmentPageDistance, style.size);
					pressure = clampNumber(eased, prevSmoothed - maxPressureDelta, prevSmoothed + maxPressureDelta);
					lastSmoothedPenPressure = pressure;
				}
			} else {
				lastSmoothedPenPressure = pressure;
			}
		}

		const nextPoint: InkPoint = [pagePoint.x, pagePoint.y, pressure];
		if (isLastSample) {
			// Mirror pointerup behavior: ensure termination at lift point without growing list.
			if (points.length === 0) {
				points.push(nextPoint);
			} else {
				const last = points[points.length - 1];
				const dx = nextPoint[0] - last[0];
				const dy = nextPoint[1] - last[1];
				const dist = Math.hypot(dx, dy);
				points[points.length - 1] = [nextPoint[0], nextPoint[1], Math.max(last[2], nextPoint[2])];
				strokePathLength += dist;
			}
		} else {
			strokePathLength += applyAppendOrMergePoint(
				mergeState,
				nextPoint,
				mergeThresholdPage,
				sampleTimeMs,
			);
		}
	}

	return { points, strokePathLength, lastSmoothedPenPressure, style };
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

function isWithinMergeRadiusPage(
	x: number,
	y: number,
	reference: InkPoint,
	mergeThresholdPage: number,
): boolean {
	const dx = x - reference[0];
	const dy = y - reference[1];
	const thresholdSq = mergeThresholdPage * mergeThresholdPage;
	return dx * dx + dy * dy < thresholdSq;
}

type PointMergeAction = 'append' | 'replace-tip';

interface PointMergeState {
	points: InkPoint[];
	lastCommittedPointAtMs: number;
}

function resolvePointMergeAction(
	points: InkPoint[],
	next: InkPoint,
	mergeThresholdPage: number,
	sampleTimeMs: number,
	lastCommittedPointAtMs: number,
): PointMergeAction {
	if (points.length === 0) return 'append';

	const last = points[points.length - 1];
	const withinTipRadius = isWithinMergeRadiusPage(next[0], next[1], last, mergeThresholdPage);
	if (!withinTipRadius) return 'append';

	if (points.length >= 2) {
		const anchor = points[points.length - 2];
		const withinAnchorRadius = isWithinMergeRadiusPage(
			next[0],
			next[1],
			anchor,
			mergeThresholdPage,
		);
		if (!withinAnchorRadius) {
			const msSinceLastCommit = sampleTimeMs - lastCommittedPointAtMs;
			if (msSinceLastCommit >= SLOW_DRAW_TIP_REPLACE_APPEND_MS) {
				return 'append';
			}
		}
	}

	return 'replace-tip';
}

/** Replace the tip when the sample is within merge radius of the current tip (fast strokes). */
function shouldReplaceTipWithPoint(
	points: InkPoint[],
	next: InkPoint,
	mergeThresholdPage: number,
	sampleTimeMs: number,
	lastCommittedPointAtMs: number,
): boolean {
	return resolvePointMergeAction(
		points,
		next,
		mergeThresholdPage,
		sampleTimeMs,
		lastCommittedPointAtMs,
	) === 'replace-tip';
}

/** @returns page-space distance from the previous tip (or zero when the list was empty). */
function applyAppendOrMergePoint(
	mergeState: PointMergeState,
	next: InkPoint,
	mergeThresholdPage: number,
	sampleTimeMs: number,
): number {
	const { points } = mergeState;
	if (points.length === 0) {
		points.push(next);
		mergeState.lastCommittedPointAtMs = sampleTimeMs;
		return 0;
	}

	const last = points[points.length - 1];
	const distToLast = Math.hypot(next[0] - last[0], next[1] - last[1]);
	const mergeAction = resolvePointMergeAction(
		points,
		next,
		mergeThresholdPage,
		sampleTimeMs,
		mergeState.lastCommittedPointAtMs,
	);
	if (mergeAction === 'replace-tip') {
		// Preserve the higher pressure when merging; avoids thin “gaps” on quick pen strokes.
		points[points.length - 1] = [next[0], next[1], Math.max(last[2], next[2])];
	} else {
		points.push(next);
		mergeState.lastCommittedPointAtMs = sampleTimeMs;
	}
	return distToLast;
}

function appendOrMergePoint(
	stroke: ActiveStroke,
	next: InkPoint,
	mergeThresholdPage: number,
	sampleTimeMs: number,
): void {
	const mergeState: PointMergeState = {
		points: stroke.points,
		lastCommittedPointAtMs: stroke.lastCommittedPointAtMs,
	};
	stroke.strokePathLength += applyAppendOrMergePoint(
		mergeState,
		next,
		mergeThresholdPage,
		sampleTimeMs,
	);
	stroke.lastCommittedPointAtMs = mergeState.lastCommittedPointAtMs;
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

/**
 * Imperatively paint the live stroke onto the HTML canvas overlay (no React re-render).
 * Keeps mid-stroke drawing off the SVG so large committed documents do not lag the tip.
 */
function updateLiveStrokePath(ctx: DrawToolContext): void {
	if (!activeStroke) return;
	const liveCanvas = ctx.getLiveStrokeCanvas();
	if (!liveCanvas) return;

	// WYSIWYG: same `points`, `getStroke`, and `toStrokeOptions` as committed SVG / export.
	// Path geometry is built with `getSvgPathFromStroke` and filled via Path2D so the canvas
	// preview matches the SVG stroke that appears on pointer up.
	paintLiveStrokeOnCanvas({
		canvas: liveCanvas,
		points: activeStroke.points,
		style: activeStroke.style,
		camera: ctx.getCamera(),
		colorHost: ctx.getLiveStrokeColorHost(),
	});
}
