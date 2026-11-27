import { getDenseEraserDetectionEnabled } from 'src/logic/device-settings/device-settings';
import type { EraserHitTester } from '../utils/eraser-hit-tester';
import type { EraserPreview } from '../eraser-preview';
import { RemoveStrokesCommand } from '../commands';
import {
	INK_STROKE_PENDING_ERASE_ANIMATION_MS,
	INK_STROKE_PENDING_ERASE_CLASS,
} from '../constants/erase-tool';
import type { StrokeStore } from '../stroke-store';
import type { UndoManager } from '../undo-manager';
import type { CameraState } from '../types';
import type { ClientPoint } from '../utils/eraser-hit-samples';
import { getEraserClientSamplePoints } from '../utils/eraser-hit-samples';
import { getStrokeIdAtClientPoint } from '../utils/stroke-hit-test';

///////////////////////////
///////////////////////////

export interface EraseToolContext {
	store: StrokeStore;
	undoManager: UndoManager;
	getCamera: () => CameraState;
	getContainerRect: () => DOMRect;
	getSvgElement: () => SVGSVGElement | null;
	preview?: EraserPreview;
	hitTester?: EraserHitTester;
	onErase?: () => void;
}

let erasing = false;
/** Snapshot once per gesture; no storage reads while the eraser moves. */
let denseDetectionEnabled = true;
let touchedStrokeIds: Set<string> = new Set();
/** When each touched stroke was marked (ms since epoch) for preview animation timing. */
let strokeMarkedAtMs = new Map<string, number>();
let lastEraseClientPoint: ClientPoint | null = null;
let pendingEraseRemovalTimeout: number | null = null;
let pendingRemovalStrokeIds: string[] | null = null;

export function eraseToolPointerDown(e: PointerEvent, ctx: EraseToolContext): void {
	flushPendingEraseRemoval(ctx);
	erasing = true;
	denseDetectionEnabled = getDenseEraserDetectionEnabled();
	touchedStrokeIds = new Set();
	strokeMarkedAtMs = new Map();
	lastEraseClientPoint = null;
	const rect = ctx.getContainerRect();
	ctx.hitTester?.begin();
	hitTestEraserAtClientPoint(e.clientX, e.clientY, null, ctx, rect);
	ctx.preview?.start(e.clientX, e.clientY, rect);
	lastEraseClientPoint = { x: e.clientX, y: e.clientY };
}

export function eraseToolPointerMove(e: PointerEvent, ctx: EraseToolContext): void {
	if (!erasing) return;
	const rect = ctx.getContainerRect();
	hitTestEraserAtClientPoint(e.clientX, e.clientY, lastEraseClientPoint, ctx, rect);
	ctx.preview?.move(e.clientX, e.clientY, rect);
	lastEraseClientPoint = { x: e.clientX, y: e.clientY };
}

export function eraseToolPointerUp(_e: PointerEvent, ctx: EraseToolContext): void {
	ctx.preview?.end();
	if (!erasing) return;
	erasing = false;
	lastEraseClientPoint = null;

	const ids = Array.from(touchedStrokeIds);
	touchedStrokeIds = new Set();

	if (ids.length > 0) {
		scheduleEraseRemoval(ctx, ids);
	}
	strokeMarkedAtMs = new Map();
}

export function eraseToolPointerCancel(_e: PointerEvent, ctx: EraseToolContext): void {
	ctx.preview?.clear();
	clearPendingEraseRemovalTimeout();
	const svg = ctx.getSvgElement();
	if (svg && touchedStrokeIds.size > 0) {
		clearPendingErasePreview(svg, touchedStrokeIds);
	}
	erasing = false;
	lastEraseClientPoint = null;
	touchedStrokeIds = new Set();
	strokeMarkedAtMs = new Map();
}

export function isEraseToolActive(): boolean {
	return erasing;
}


// Helpers
///////////////////////////

/**
 * Hit-test strokes under the eraser footprint (radius + sweep along the drag path).
 * Cached SVG path geometry avoids per-sample browser layout/paint hit queries.
 * The existing DOM picker remains a fallback for runtimes without Path2D.
 */
function hitTestEraserAtClientPoint(
	clientX: number,
	clientY: number,
	lastClientPoint: ClientPoint | null,
	ctx: EraseToolContext,
	containerRect: DOMRect,
): void {
	const svg = ctx.getSvgElement();
	if (!svg) return;

	const cameraZoom = ctx.getCamera().zoom;
	const samplePoints = getEraserClientSamplePoints(
		clientX,
		clientY,
		lastClientPoint,
		cameraZoom,
		denseDetectionEnabled,
	);
	let hits = ctx.hitTester?.hitTest(samplePoints, ctx.getCamera(), containerRect) ?? null;
	if (hits === null) {
		hits = new Set<string>();
		for (const sample of samplePoints) {
			const strokeId = getStrokeIdAtClientPoint(svg, sample.x, sample.y);
			if (strokeId) hits.add(strokeId);
		}
	}
	// Finish all geometry/DOM reads before adding classes that trigger visual updates.
	for (const strokeId of hits) markStrokeForErase(svg, strokeId);
}

function getStrokeGroupElement(svg: SVGSVGElement, strokeId: string): SVGGElement | null {
	return svg.querySelector<SVGGElement>(
		`[data-stroke-group][data-stroke-id="${CSS.escape(strokeId)}"]`,
	);
}

function markStrokeForErase(svg: SVGSVGElement, strokeId: string): void {
	if (touchedStrokeIds.has(strokeId)) return;

	const strokeGroup = getStrokeGroupElement(svg, strokeId);
	if (!strokeGroup) return;

	touchedStrokeIds.add(strokeId);
	strokeMarkedAtMs.set(strokeId, Date.now());
	strokeGroup.classList.add(INK_STROKE_PENDING_ERASE_CLASS);
}

function clearPendingErasePreview(svg: SVGSVGElement, strokeIds: Iterable<string>): void {
	for (const strokeId of strokeIds) {
		const strokeGroup = getStrokeGroupElement(svg, strokeId);
		strokeGroup?.classList.remove(INK_STROKE_PENDING_ERASE_CLASS);
	}
}

function clearPendingEraseRemovalTimeout(): void {
	if (pendingEraseRemovalTimeout === null) return;
	window.clearTimeout(pendingEraseRemovalTimeout);
	pendingEraseRemovalTimeout = null;
}

function flushPendingEraseRemoval(ctx: EraseToolContext): void {
	clearPendingEraseRemovalTimeout();
	const strokeIds = pendingRemovalStrokeIds;
	pendingRemovalStrokeIds = null;
	if (!strokeIds?.length) return;
	const command = new RemoveStrokesCommand(ctx.store, strokeIds);
	ctx.undoManager.execute(command);
	ctx.onErase?.();
}

/** Wait until the last-marked stroke has had a full preview animation, then remove all. */
function scheduleEraseRemoval(ctx: EraseToolContext, strokeIds: string[]): void {
	clearPendingEraseRemovalTimeout();
	pendingRemovalStrokeIds = strokeIds;
	const now = Date.now();
	let maxElapsedMs = 0;
	for (const strokeId of strokeIds) {
		const markedAt = strokeMarkedAtMs.get(strokeId) ?? now;
		maxElapsedMs = Math.max(maxElapsedMs, now - markedAt);
	}
	const remainingMs = Math.max(0, INK_STROKE_PENDING_ERASE_ANIMATION_MS - maxElapsedMs);
	pendingEraseRemovalTimeout = window.setTimeout(() => {
		pendingEraseRemovalTimeout = null;
		pendingRemovalStrokeIds = null;
		const command = new RemoveStrokesCommand(ctx.store, strokeIds);
		ctx.undoManager.execute(command);
		ctx.onErase?.();
	}, remainingMs);
}
