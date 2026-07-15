import type { CameraState, InkPoint, InkStrokeStyle } from '../types';
import { toStrokeOptions } from '../types';
import { getStroke } from 'perfect-freehand';
import { getSvgPathFromStroke } from './svg-path-from-stroke';

///////////////////////////
///////////////////////////

/**
 * Keep the live-stroke overlay canvas sized to its CSS box at the current DPR.
 * Returns the 2D context in a reset identity state, or null when unavailable.
 */
export function prepareLiveStrokeCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
	const parent = canvas.parentElement;
	const cssWidth = parent?.clientWidth || canvas.clientWidth;
	const cssHeight = parent?.clientHeight || canvas.clientHeight;
	if (cssWidth <= 0 || cssHeight <= 0) return null;

	const dpr = typeof window !== 'undefined' && window.devicePixelRatio
		? window.devicePixelRatio
		: 1;
	const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
	const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));

	if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
		canvas.width = pixelWidth;
		canvas.height = pixelHeight;
	}

	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	ctx.setTransform(1, 0, 0, 1, 0, 0);
	return ctx;
}

/** Clear the entire live overlay (call on pointer up / cancel). */
export function clearLiveStrokeCanvas(canvas: HTMLCanvasElement | null | undefined): void {
	if (!canvas) return;
	const ctx = prepareLiveStrokeCanvas(canvas);
	if (!ctx) return;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Resolve CSS colours like `currentColor` against a host element so canvas fills
 * match the SVG committed-stroke colour.
 */
export function resolveCanvasFillColor(color: string, host: Element | null): string {
	if (!host) return color === 'currentColor' ? '#000000' : color;
	if (color !== 'currentColor' && !color.startsWith('var(')) return color;
	const style = window.getComputedStyle(host);
	return style.color || '#000000';
}

/**
 * Paint the in-progress stroke onto the overlay canvas using the same
 * `getStroke` + `getSvgPathFromStroke` pipeline as committed SVG strokes.
 * Coordinates are page-space; the camera transform matches the SVG `<g>`.
 */
export function paintLiveStrokeOnCanvas(args: {
	canvas: HTMLCanvasElement;
	points: InkPoint[];
	style: InkStrokeStyle;
	camera: CameraState;
	colorHost: Element | null;
}): void {
	const { canvas, points, style, camera, colorHost } = args;
	const ctx = prepareLiveStrokeCanvas(canvas);
	if (!ctx) return;

	ctx.clearRect(0, 0, canvas.width, canvas.height);
	if (points.length === 0) return;

	const outlinePoints = getStroke(points, toStrokeOptions(style));
	const pathData = getSvgPathFromStroke(outlinePoints);
	if (!pathData) return;

	const dpr = typeof window !== 'undefined' && window.devicePixelRatio
		? window.devicePixelRatio
		: 1;

	// Match SVG: scale(zoom) translate(x, y) — applied after DPR so 1 CSS px = 1 screen px.
	ctx.setTransform(
		dpr * camera.zoom,
		0,
		0,
		dpr * camera.zoom,
		dpr * camera.zoom * camera.x,
		dpr * camera.zoom * camera.y,
	);

	const path = new Path2D(pathData);
	ctx.fillStyle = resolveCanvasFillColor(style.color, colorHost);
	ctx.fill(path);
}
