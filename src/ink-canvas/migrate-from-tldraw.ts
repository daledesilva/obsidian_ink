import type { InkCanvasSnapshot, InkPoint, InkStroke, InkStrokeStyle } from './types';
import { DEFAULT_STROKE_STYLE } from './types';

///////////////////////////
///////////////////////////

/**
 * Size-to-pixel mapping matching tldraw's internal STROKE_SIZES for draw shapes.
 * perfect-freehand uses these as the `size` option directly.
 * We multiply by a scale factor to match tldraw's rendered output, which runs
 * the stroke through its own draw-shape renderer with additional scaling.
 */
const TLDRAW_SIZE_TO_PX: Record<string, number> = {
	s: 2,
	m: 3.5,
	l: 5,
	xl: 10,
};

/**
 * tldraw's default light theme color palette (solid fill values).
 * Draw shapes use the `solid` key of the color theme.
 */
const TLDRAW_COLOR_MAP: Record<string, string> = {
	'black':        '#1d1d1d',
	'grey':         '#9fa8b2',
	'light-violet': '#e085f4',
	'violet':       '#ae3ec9',
	'blue':         '#4465e9',
	'light-blue':   '#4ba1f1',
	'yellow':       '#f1ac4b',
	'orange':       '#e16919',
	'green':        '#099268',
	'light-green':  '#4cb05e',
	'light-red':    '#f87777',
	'red':          '#e03131',
	'white':        '#FFFFFF',
};

/**
 * A minimal representation of a tldraw draw shape record as found in a
 * TLEditorSnapshot store. We only reference the fields we need for migration.
 */
interface TldrawDrawRecord {
	typeName: 'shape';
	type: 'draw';
	id: string;
	x: number;
	y: number;
	props: {
		color: string;
		size: string;
		segments: Array<{
			type: string;
			points: Array<{ x: number; y: number; z: number }>;
		}>;
		isPen: boolean;
		isComplete: boolean;
		scale?: number;
	};
}

interface TldrawCameraRecord {
	typeName: 'camera';
	x: number;
	y: number;
	z: number; // z is zoom in tldraw camera
}

interface TldrawStoreRecord {
	typeName: string;
	type?: string;
	[key: string]: unknown;
}

/**
 * Migrate a tldraw `TLEditorSnapshot` store into an `InkCanvasSnapshot`.
 *
 * Walks all store records, finds `type === 'draw'` shapes, and converts them
 * to `InkStroke` objects. Also reads the camera record.
 *
 * @param tldrawSnapshot The raw TLEditorSnapshot object (with `store` property containing records).
 * @returns An InkCanvasSnapshot ready for use with the ink-canvas engine.
 */
export function migrateFromTldraw(tldrawSnapshot: { store?: Record<string, TldrawStoreRecord> }): InkCanvasSnapshot {
	const snapshot: InkCanvasSnapshot = {
		version: 1,
		strokes: [],
		camera: { x: 0, y: 0, zoom: 1 },
		gridEnabled: false,
	};

	if (!tldrawSnapshot.store) return snapshot;

	const store = tldrawSnapshot.store;

	for (const key of Object.keys(store)) {
		const record = store[key];

		// Extract camera
		if (record.typeName === 'camera') {
			const cam = record as unknown as TldrawCameraRecord;
			snapshot.camera = {
				x: cam.x,
				y: cam.y,
				zoom: cam.z ?? 1,
			};
			continue;
		}

		// Extract draw shapes
		const isDrawShape = record.typeName === 'shape' && record.type === 'draw';
		if (!isDrawShape) continue;

		const drawRecord = record as unknown as TldrawDrawRecord;
		const stroke = convertDrawShape(drawRecord);
		if (stroke) snapshot.strokes.push(stroke);
	}

	return snapshot;
}


// Conversion helpers
///////////////////////////

function convertDrawShape(shape: TldrawDrawRecord): InkStroke | null {
	const allPoints: InkPoint[] = [];

	for (const segment of shape.props.segments) {
		for (const pt of segment.points) {
			// tldraw uses z for pressure; 0 or 0.5 means no real pressure
			allPoints.push([pt.x, pt.y, pt.z ?? 0.5]);
		}
	}

	if (allPoints.length === 0) return null;

	const style = mapTldrawStyle(shape.props);

	return {
		id: shape.id,
		points: allPoints,
		style,
		// tldraw shapes have their own (x,y) position which is like an offset
		offset: { x: shape.x, y: shape.y },
	};
}

function mapTldrawStyle(props: TldrawDrawRecord['props']): InkStrokeStyle {
	const basePx = TLDRAW_SIZE_TO_PX[props.size] ?? TLDRAW_SIZE_TO_PX['m'];
	// tldraw's draw shape renderer uses `1 + size * 1.5` as the effective
	// perfect-freehand size. We replicate that here.
	const effectiveSize = 1 + basePx * 1.5;

	const color = TLDRAW_COLOR_MAP[props.color] ?? TLDRAW_COLOR_MAP['black'];
	const simulatePressure = !props.isPen;

	return {
		...DEFAULT_STROKE_STYLE,
		size: effectiveSize,
		simulatePressure,
		color,
	};
}
