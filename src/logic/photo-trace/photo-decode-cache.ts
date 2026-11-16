import type { PhotoBatch, PhotoBatchItem } from './photo-batch-session';

//////////
//////////

/**
 * A few decoded photos kept so the next adjust dialog can open without waiting.
 *
 * Thumbnail prep already drops each bitmap after it reads the page corners, because a
 * batch of working-size photos does not fit on a tablet. This cache keeps only the
 * photo on screen and its neighbours, which is what Prev and Next are about to show.
 */
export class PhotoDecodeCache {
	private images = new Map<string, ImageData>();
	private pending = new Map<string, Promise<ImageData | null>>();
	private errors = new Map<string, string>();

	constructor(private readonly decode: (item: PhotoBatchItem) => Promise<ImageData>) {}

	/** The bitmap when this photo was already decoded. Null when it still has to load. */
	peek(itemId: string): ImageData | null {
		return this.images.get(itemId) ?? null;
	}

	/** Why a previous decode failed, so the queue can skip the photo without trying again. */
	errorFor(itemId: string): string | null {
		return this.errors.get(itemId) ?? null;
	}

	/**
	 * Resolves with the working bitmap, or null when the file could not be read.
	 * Shares one in-flight decode per photo so a prefetch and a click do not decode twice.
	 */
	load(item: PhotoBatchItem): Promise<ImageData | null> {
		const cached = this.images.get(item.id);
		if (cached) return Promise.resolve(cached);
		const inFlight = this.pending.get(item.id);
		if (inFlight) return inFlight;

		const pending = this.decode(item)
			.then((photoImage) => {
				this.images.set(item.id, photoImage);
				this.errors.delete(item.id);
				return photoImage;
			})
			.catch((error: unknown) => {
				this.errors.set(item.id, String(error));
				return null;
			})
			.finally(() => {
				this.pending.delete(item.id);
			});
		this.pending.set(item.id, pending);
		return pending;
	}

	/**
	 * Starts a decode and forgets it.
	 *
	 * Used while a dialog is already open, so Prev and Next are usually ready by the
	 * time they are clicked. A photo that is already converted has no bitmap to decode.
	 */
	prefetch(item: PhotoBatchItem | undefined): void {
		if (!item || item.convertedTarget) return;
		if (this.images.has(item.id) || this.pending.has(item.id) || this.errors.has(item.id)) return;
		void this.load(item);
	}

	/**
	 * Decodes the photos on either side of the one on screen, and drops bitmaps further away.
	 */
	prefetchAround(batch: PhotoBatch, index: number): void {
		this.prefetch(batch.items[index - 1]);
		this.prefetch(batch.items[index + 1]);
		this.retainAround(batch, index);
	}

	/**
	 * Keeps a single photo warm while the thumbnail grid is open.
	 *
	 * Refine images opens that photo. Holding every picked file decoded would undo the
	 * memory limit the grid already respects.
	 */
	warmItem(item: PhotoBatchItem | undefined): void {
		const keepId = item?.id;
		for (const itemId of this.images.keys()) {
			if (itemId !== keepId) this.images.delete(itemId);
		}
		this.prefetch(item);
	}

	/**
	 * Returns a promise only when the bitmap is not ready yet.
	 *
	 * A ready photo returns void so the dialog can close inside the click, with no
	 * spinner. Callers treat a promise as "stay open and spin the button".
	 */
	prepare(item: PhotoBatchItem | undefined): void | Promise<void> {
		if (!item || item.convertedTarget) return;
		if (this.images.has(item.id) || this.errors.has(item.id)) return;
		return this.load(item).then(() => undefined);
	}

	/** Forgets bitmaps that are not the current photo or a neighbour. */
	private retainAround(batch: PhotoBatch, index: number): void {
		const keep = new Set<string>();
		for (const offset of [-1, 0, 1]) {
			const neighbor = batch.items[index + offset];
			if (neighbor) keep.add(neighbor.id);
		}
		for (const itemId of this.images.keys()) {
			if (!keep.has(itemId)) this.images.delete(itemId);
		}
	}
}
