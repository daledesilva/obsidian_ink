import type { StrokeOptions } from 'perfect-freehand';
import { identityStrokePressureEasing, inkStrokeUsesPenEasing, penStrokePressureEasing } from './stroke-easing';

///////////////////////////
///////////////////////////

/** A single point captured during pen/stylus input: [x, y, pressure]. */
export type InkPoint = [x: number, y: number, pressure: number];

/** Rendering options stored per-stroke so each stroke can have its own visual style. */
export interface InkStrokeStyle {
	/** Base diameter in canvas units. */
	size: number;
	/** How much pressure affects width. Range: -1 to 1. */
	thinning: number;
	/** Edge softness. Range: 0 to 1. */
	smoothing: number;
	/** How much to streamline the stroke. Range: 0 to 1. */
	streamline: number;
	/** When true, velocity simulates pressure (mouse input). When false, real pressure is used. */
	simulatePressure: boolean;
	/**
	 * How the stroke was authored for preset/easing (JSON-safe).
	 * Omitted on legacy strokes; easing falls back to `simulatePressure === false` ⇒ pen curve.
	 */
	inputKind?: 'pen' | 'mouse';
	/** Fill colour (CSS). */
	color: string;
}

/** A completed stroke stored in the stroke store. */
export interface InkStroke {
	id: string;
	/** Raw captured input points. */
	points: InkPoint[];
	/** Visual style at the time the stroke was drawn. */
	style: InkStrokeStyle;
	/** Translation applied after creation (e.g. via the select-and-move tool). */
	offset: { x: number; y: number };
}

/** Serialisable snapshot of the entire canvas state. */
export interface InkCanvasSnapshot {
	/** Format discriminator — always 1 for this version. */
	version: 1;
	strokes: InkStroke[];
	/** Camera position at last save. Omitted until the user explicitly moves the camera,
	 *  so the canvas auto-fits to strokes on every open until a deliberate camera position exists. */
	camera?: CameraState;
	gridEnabled: boolean;
	/** Present only on inkWriting files. Height in px of each ruled line. */
	writingLineHeight?: number;
}

/** Camera position and zoom level. */
export interface CameraState {
	x: number;
	y: number;
	zoom: number;
}

/** Default stroke style applied to new strokes. */
export const DEFAULT_STROKE_STYLE: InkStrokeStyle = {
	size: 8,
	thinning: 0.5,
	smoothing: 0.5,
	streamline: 0.5,
	simulatePressure: true,
	color: 'currentColor',
};

/** Convert an InkStrokeStyle to perfect-freehand StrokeOptions. */
export function toStrokeOptions(style: InkStrokeStyle): StrokeOptions {
	const easing = inkStrokeUsesPenEasing(style) ? penStrokePressureEasing : identityStrokePressureEasing;
	return {
		size: style.size,
		thinning: style.thinning,
		smoothing: style.smoothing,
		streamline: style.streamline,
		simulatePressure: style.simulatePressure,
		easing,
		last: true,
		start: { cap: true, taper: 0 },
		end: { cap: true, taper: 0 },
	};
}

/** The active drawing tool. */
export type InkTool = 'draw' | 'erase' | 'select';

/**
 * Public interface exposed by the ink canvas to the rest of the system.
 * This is the contract that replaces tldraw's `Editor` for drawing mode.
 */
export interface InkCanvasEditor {
	// Undo / redo
	undo(): void;
	redo(): void;
	canUndo(): boolean;
	canRedo(): boolean;
	getUndoCount(): number;

	// Tools
	setTool(tool: InkTool): void;
	getCurrentTool(): InkTool;

	// Stroke style
	getStrokeStyle(): InkStrokeStyle;
	setStrokeStyle(style: Partial<InkStrokeStyle>): void;

	// Camera
	getCamera(): CameraState;
	setCamera(camera: Partial<CameraState>): void;

	// Grid
	isGridEnabled(): boolean;
	setGridEnabled(enabled: boolean): void;

	// Selection
	getSelectedStrokeIds(): Set<string>;
	deleteSelectedStrokes(): void;

	// Data
	getSnapshot(): InkCanvasSnapshot;
	eraseAll(): void;

	// Programmatic stroke creation (e.g. Boox bridge)
	addStroke(stroke: InkStroke): void;

	// Coordinate mapping
	screenToPage(screenX: number, screenY: number): { x: number; y: number };

	// DOM access
	getContainerElement(): HTMLElement | null;
	getSvgElement(): SVGSVGElement | null;

	/** Writing mode only: returns the current computed page height in page units.
	 *  In draw mode this returns 0. */
	getPageHeight(): number;

	/** Writing mode only: sets page height (e.g. manual expand-lines). No-op in draw mode. */
	setWritingPageHeight(height: number): void;
}
