import type { InkStroke } from './types';

///////////////////////////
///////////////////////////

export type StrokeStoreChange =
	| { type: 'add' | 'addMany' | 'remove' | 'updateOffsets'; ids: string[] }
	| { type: 'clear' | 'replaceAll'; ids: [] };

/** Listeners receive which strokes changed so caches can invalidate surgically. */
export type StrokeStoreListener = (change: StrokeStoreChange) => void;

/**
 * Reactive store for ink strokes. Maintains an ordered list of strokes and
 * notifies listeners on any mutation. All mutations go through public methods
 * so the undo system can replay them.
 */
export class StrokeStore {
	private strokes: Map<string, InkStroke> = new Map();
	private insertionOrder: string[] = [];
	private listeners: Set<StrokeStoreListener> = new Set();

	subscribe(listener: StrokeStoreListener): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}

	private notify(change: StrokeStoreChange): void {
		for (const listener of this.listeners) {
			listener(change);
		}
	}

	add(stroke: InkStroke): void {
		this.strokes.set(stroke.id, stroke);
		this.insertionOrder.push(stroke.id);
		this.notify({ type: 'add', ids: [stroke.id] });
	}

	addMany(strokesArr: InkStroke[]): void {
		for (const stroke of strokesArr) {
			this.strokes.set(stroke.id, stroke);
			this.insertionOrder.push(stroke.id);
		}
		this.notify({ type: 'addMany', ids: strokesArr.map((stroke) => stroke.id) });
	}

	remove(ids: string[]): void {
		const idSet = new Set(ids);
		for (const id of ids) {
			this.strokes.delete(id);
		}
		this.insertionOrder = this.insertionOrder.filter(id => !idSet.has(id));
		this.notify({ type: 'remove', ids: [...ids] });
	}

	/** Update the offset of one or more strokes (used by the select-and-move tool). */
	updateOffsets(offsets: Map<string, { x: number; y: number }>): void {
		for (const [id, offset] of offsets) {
			const stroke = this.strokes.get(id);
			if (stroke) {
				this.strokes.set(id, { ...stroke, offset });
			}
		}
		this.notify({ type: 'updateOffsets', ids: Array.from(offsets.keys()) });
	}

	getById(id: string): InkStroke | undefined {
		return this.strokes.get(id);
	}

	/** Returns all strokes in insertion order. */
	getAll(): InkStroke[] {
		return this.insertionOrder
			.map(id => this.strokes.get(id))
			.filter((s): s is InkStroke => s !== undefined);
	}

	getAllIds(): string[] {
		return [...this.insertionOrder];
	}

	count(): number {
		return this.strokes.size;
	}

	clear(): void {
		this.strokes.clear();
		this.insertionOrder = [];
		this.notify({ type: 'clear', ids: [] });
	}

	/** Replace all content with the given strokes (used for snapshot restore). */
	replaceAll(strokesArr: InkStroke[]): void {
		this.strokes.clear();
		this.insertionOrder = [];
		for (const stroke of strokesArr) {
			this.strokes.set(stroke.id, stroke);
			this.insertionOrder.push(stroke.id);
		}
		this.notify({ type: 'replaceAll', ids: [] });
	}
}
