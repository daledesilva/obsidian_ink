import { RemoveStrokesCommand } from '../commands';
import type { StrokeStore } from '../stroke-store';
import type { UndoManager } from '../undo-manager';
import type { CameraState } from '../types';

///////////////////////////
///////////////////////////

export interface EraseToolContext {
	store: StrokeStore;
	undoManager: UndoManager;
	getCamera: () => CameraState;
	getContainerRect: () => DOMRect;
	getSvgElement: () => SVGSVGElement | null;
	onErase?: () => void;
}

let erasing = false;
let touchedStrokeIds: Set<string> = new Set();

export function eraseToolPointerDown(e: PointerEvent, ctx: EraseToolContext): void {
	erasing = true;
	touchedStrokeIds = new Set();
	hitTestAtPoint(e, ctx);
}

export function eraseToolPointerMove(e: PointerEvent, ctx: EraseToolContext): void {
	if (!erasing) return;
	hitTestAtPoint(e, ctx);
}

export function eraseToolPointerUp(_e: PointerEvent, ctx: EraseToolContext): void {
	if (!erasing) return;
	erasing = false;

	if (touchedStrokeIds.size > 0) {
		const ids = Array.from(touchedStrokeIds);
		const command = new RemoveStrokesCommand(ctx.store, ids);
		ctx.undoManager.execute(command);
		ctx.onErase?.();
	}

	touchedStrokeIds = new Set();
}

export function eraseToolPointerCancel(_e: PointerEvent, _ctx: EraseToolContext): void {
	erasing = false;
	touchedStrokeIds = new Set();
}

export function isEraseToolActive(): boolean {
	return erasing;
}


// Helpers
///////////////////////////

/**
 * Hit-test strokes at the given pointer position.
 * Uses the rendered SVG hit target directly so it respects transforms and works
 * in runtimes where SVGGeometryElement.isPointInFill() is unavailable.
 */
function hitTestAtPoint(e: PointerEvent, ctx: EraseToolContext): void {
	const svg = ctx.getSvgElement();
	if (!svg) return;

	const strokeId = getStrokeIdAtClientPoint(svg, e.clientX, e.clientY);
	if (!strokeId) return;
	if (touchedStrokeIds.has(strokeId)) return;

	const strokeElement = svg.querySelector<SVGElement>(`[data-stroke-id="${CSS.escape(strokeId)}"]`);
	if (!strokeElement) return;

	touchedStrokeIds.add(strokeId);
	// Visually indicate the stroke will be erased
	strokeElement.style.opacity = '0.3';
}

function getStrokeIdAtClientPoint(svg: SVGSVGElement, clientX: number, clientY: number): string | null {
	const document = svg.ownerDocument;
	if (!document) return null;

	const elementsAtPoint = document.elementsFromPoint?.(clientX, clientY) ?? [];
	for (const element of elementsAtPoint) {
		if (!(element instanceof Element)) continue;
		const strokeElement = element.closest('[data-stroke-id]');
		if (!strokeElement || !svg.contains(strokeElement)) continue;
		const strokeId = strokeElement.getAttribute('data-stroke-id');
		if (strokeId) return strokeId;
	}

	const fallback = document.elementFromPoint(clientX, clientY);
	if (!fallback) return null;
	const strokeElement = fallback.closest('[data-stroke-id]');
	if (!strokeElement || !svg.contains(strokeElement)) return null;
	return strokeElement.getAttribute('data-stroke-id');
}
