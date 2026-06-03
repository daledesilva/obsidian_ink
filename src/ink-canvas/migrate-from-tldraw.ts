import { WRITING_LINE_HEIGHT } from 'src/constants';
import { buildInkStrokeStyleForTreatAs } from './stroke-presets';
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

/** Raw tldraw snapshot as stored in SVG metadata (v2.1+ uses `document.store`). */
export interface TldrawSnapshotForMigration {
	store?: Record<string, unknown>;
	document?: { store?: Record<string, unknown> };
	session?: { isGridMode?: boolean };
}

/** v2.1+ snapshots nest the store under `document`; older captures may use top-level `store`. */
function getTldrawStoreForMigration(
	tldrawSnapshot: TldrawSnapshotForMigration,
): Record<string, TldrawStoreRecord> | undefined {
	const topLevel = tldrawSnapshot.store;
	if (topLevel) return topLevel as Record<string, TldrawStoreRecord>;
	const nested = tldrawSnapshot.document?.store;
	if (nested) return nested as Record<string, TldrawStoreRecord>;
	return undefined;
}

function readGridEnabledFromTldrawSession(
	tldrawSnapshot: TldrawSnapshotForMigration,
): boolean {
	return tldrawSnapshot.session?.isGridMode !== false;
}

/**
 * Migrate a tldraw `TLEditorSnapshot` store into an `InkCanvasSnapshot`.
 *
 * Walks all store records, finds `type === 'draw'` shapes, and converts them
 * to `InkStroke` objects. Does not persist camera (editor auto-fits on open).
 *
 * @param tldrawSnapshot The raw TLEditorSnapshot object (with `store` property containing records).
 * @returns An InkCanvasSnapshot ready for use with the ink-canvas engine.
 */
export function migrateFromTldraw(tldrawSnapshot: TldrawSnapshotForMigration): InkCanvasSnapshot {
	const snapshot: InkCanvasSnapshot = {
		version: 1,
		strokes: [],
		gridEnabled: readGridEnabledFromTldrawSession(tldrawSnapshot),
	};

	const store = getTldrawStoreForMigration(tldrawSnapshot);
	if (!store) return snapshot;

	const captureZoom = readCameraZoomFromStore(store);
	for (const key of Object.keys(store)) {
		const record = store[key];
		const isDrawShape = record.typeName === 'shape' && record.type === 'draw';
		if (!isDrawShape) continue;

		const drawRecord = record as unknown as TldrawDrawRecord;
		const stroke = convertDrawShape(drawRecord, captureZoom);
		if (stroke) snapshot.strokes.push(stroke);
	}

	return snapshot;
}

/**
 * Migrate a tldraw writing TLEditorSnapshot into an InkCanvasSnapshot.
 *
 * Reads all draw shapes, ignores writing-container and writing-lines shapes.
 * Reads writingLineHeight from document meta if present.
 *
 * Known limitation — stash gap: the tldraw writing editor used a stash system to
 * hide old strokes above writingStrokeLimit from the tldraw store. At the last save,
 * stashed strokes were not written to the file. If a file was saved while strokes
 * were in the stash, those early strokes are permanently missing from the SVG and
 * the tldraw JSON — they cannot be recovered by migration.
 */
export function migrateWritingFromTldraw(
	tldrawSnapshot: TldrawSnapshotForMigration,
	fallbackLineHeight: number = WRITING_LINE_HEIGHT,
): InkCanvasSnapshot {
	const snapshot: InkCanvasSnapshot = {
		version: 1,
		strokes: [],
		gridEnabled: false,
		writingLineHeight: fallbackLineHeight,
	};

	const store = getTldrawStoreForMigration(tldrawSnapshot);
	if (!store) return snapshot;

	let writingLineHeight = fallbackLineHeight;
	const documentRecord = store['document:document'];
	if (documentRecord) {
		const meta = (documentRecord as { meta?: Record<string, unknown> }).meta;
		if (meta && typeof meta.writingLineHeight === 'number' && meta.writingLineHeight > 0) {
			writingLineHeight = meta.writingLineHeight;
		}
	}

	const captureZoom = readCameraZoomFromStore(store);

	for (const key of Object.keys(store)) {
		const record = store[key];
		const isDrawShape = record.typeName === 'shape' && record.type === 'draw';
		if (!isDrawShape) continue;

		const drawRecord = record as unknown as TldrawDrawRecord;
		const stroke = convertDrawShape(drawRecord, captureZoom);
		if (stroke) snapshot.strokes.push(stroke);
	}

	snapshot.writingLineHeight = writingLineHeight;
	return snapshot;
}


// Conversion helpers
///////////////////////////

function readCameraZoomFromStore(store: Record<string, TldrawStoreRecord>): number {
	for (const key of Object.keys(store)) {
		const record = store[key];
		if (record.typeName !== 'camera') continue;
		const cam = record as unknown as TldrawCameraRecord;
		return cam.z ?? 1;
	}
	return 1;
}

function convertDrawShape(shape: TldrawDrawRecord, captureZoom: number): InkStroke | null {
	const allPoints: InkPoint[] = [];

	for (const segment of shape.props.segments) {
		for (const pt of segment.points) {
			// tldraw uses z for pressure; 0 or 0.5 means no real pressure
			allPoints.push([pt.x, pt.y, pt.z ?? 0.5]);
		}
	}

	if (allPoints.length === 0) return null;

	const style = mapTldrawStyle(shape.props, captureZoom);

	return {
		id: shape.id,
		points: allPoints,
		style,
		// tldraw shapes have their own (x,y) position which is like an offset
		offset: { x: shape.x, y: shape.y },
	};
}

function mapTldrawStyle(
	props: TldrawDrawRecord['props'],
	captureZoom: number,
): InkStrokeStyle {
	const basePx = TLDRAW_SIZE_TO_PX[props.size] ?? TLDRAW_SIZE_TO_PX['m'];
	// tldraw's draw shape renderer uses `1 + size * 1.5` as the effective
	// perfect-freehand size. We replicate that here.
	const effectiveSize = 1 + basePx * 1.5;
	const treatAs = props.isPen ? 'pen' : 'mouse';

	const base: InkStrokeStyle = {
		...DEFAULT_STROKE_STYLE,
		size: effectiveSize,
		color: 'currentColor',
	};

	return buildInkStrokeStyleForTreatAs(base, treatAs, captureZoom);
}
