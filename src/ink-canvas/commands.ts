import type { StrokeStore } from './stroke-store';
import type { InkStroke } from './types';

///////////////////////////
///////////////////////////

/** Base interface for all undo/redo commands. */
export interface InkCommand {
	apply(): void;
	unapply(): void;
}

/** Add a single stroke to the store. */
export class AddStrokeCommand implements InkCommand {
	private store: StrokeStore;
	private stroke: InkStroke;

	constructor(store: StrokeStore, stroke: InkStroke) {
		this.store = store;
		this.stroke = stroke;
	}

	apply(): void {
		this.store.add(this.stroke);
	}

	unapply(): void {
		this.store.remove([this.stroke.id]);
	}
}

/** Remove one or more strokes from the store. */
export class RemoveStrokesCommand implements InkCommand {
	private store: StrokeStore;
	private removedStrokes: InkStroke[];

	constructor(store: StrokeStore, strokeIds: string[]) {
		this.store = store;
		// Capture the full stroke data at construction time so we can restore on unapply
		this.removedStrokes = strokeIds
			.map(id => store.getById(id))
			.filter((s): s is InkStroke => s !== undefined);
	}

	apply(): void {
		const ids = this.removedStrokes.map(s => s.id);
		this.store.remove(ids);
	}

	unapply(): void {
		this.store.addMany(this.removedStrokes);
	}
}

/** Move one or more strokes by updating their offsets. */
export class MoveStrokesCommand implements InkCommand {
	private store: StrokeStore;
	private strokeIds: string[];
	private previousOffsets: Map<string, { x: number; y: number }>;
	private newOffsets: Map<string, { x: number; y: number }>;

	constructor(
		store: StrokeStore,
		strokeIds: string[],
		deltaX: number,
		deltaY: number,
	) {
		this.store = store;
		this.strokeIds = strokeIds;

		// Capture previous offsets and compute new ones
		this.previousOffsets = new Map();
		this.newOffsets = new Map();
		for (const id of strokeIds) {
			const stroke = store.getById(id);
			if (!stroke) continue;
			this.previousOffsets.set(id, { ...stroke.offset });
			this.newOffsets.set(id, {
				x: stroke.offset.x + deltaX,
				y: stroke.offset.y + deltaY,
			});
		}
	}

	apply(): void {
		this.store.updateOffsets(this.newOffsets);
	}

	unapply(): void {
		this.store.updateOffsets(this.previousOffsets);
	}
}

/** Erase all strokes (used by the "erase all" menu action). */
export class EraseAllCommand implements InkCommand {
	private store: StrokeStore;
	private previousStrokes: InkStroke[];

	constructor(store: StrokeStore) {
		this.store = store;
		this.previousStrokes = store.getAll();
	}

	apply(): void {
		this.store.clear();
	}

	unapply(): void {
		this.store.replaceAll(this.previousStrokes);
	}
}
