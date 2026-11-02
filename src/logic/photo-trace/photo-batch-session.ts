import type { InkPhotoConvertTarget } from './photo-convert-target';
import type { PagePoint } from './find-page-quad';
import type { PagePhotoAdjustment } from './adjust-page-photo';

//////////
//////////

export type PhotoCornerQuad = [PagePoint, PagePoint, PagePoint, PagePoint];

/**
 * Everything the adjust and convert steps need for one photo, remembered so a
 * revisit (or Convert all) does not redo the corners or the detection guess.
 */
export interface PhotoStepSettings {
	corners: PhotoCornerQuad;
	quarterTurnsClockwise: number;
	adjustment: PagePhotoAdjustment;
	inkSensitivity: number;
	noiseCleanup: boolean;
}

/**
 * The page shape the user confirmed on the corners step, before any detection
 * sliders were touched. Convert all reuses this so a hand-placed crop is never lost.
 */
export interface PinnedPhotoPage {
	corners: PhotoCornerQuad;
	quarterTurnsClockwise: number;
}

/**
 * One photo waiting its turn. The File and the thumbnail are the only pixels kept
 * between steps: warped rasters are released after each convert so a batch of
 * large phone photos stays within the tablet's memory.
 */
export interface PhotoBatchItem {
	id: string;
	file: File;
	/** Object URL for the thumbnail. Revoked by disposePhotoBatch. */
	thumbnailUrl: string;
	/** Chosen on the grid, defaults to 'writing'. */
	target: InkPhotoConvertTarget;
	/** Cached findPageQuad result, because detection is the slowest local step. */
	detectedCorners: PhotoCornerQuad | null;
	/**
	 * Corners confirmed on the corners step. Kept apart from `settings` so Convert all
	 * can honour a pinned page even when the detection sliders were never touched.
	 */
	pinnedPage: PinnedPhotoPage | null;
	settings: PhotoStepSettings | null;
	/** Set once the ink file and embed exist, so the photo can never be inserted twice. */
	convertedTarget: InkPhotoConvertTarget | null;
	/** True aspect ratio of the photo, so a grid thumbnail can match its shape. */
	thumbnailAspectRatio: number | null;
	/**
	 * Page corners in 0–1 space for the thumbnail overlay. Normalized so the overlay
	 * scales with whatever size the card is drawn at.
	 */
	thumbnailCorners: NormalizedPageQuad | null;
}

/** A page quad where each point is a 0–1 fraction of the photo's width and height. */
export interface NormalizedPagePoint {
	x: number;
	y: number;
}

export type NormalizedPageQuad = [
	NormalizedPagePoint,
	NormalizedPagePoint,
	NormalizedPagePoint,
	NormalizedPagePoint,
];

export interface PhotoBatch {
	items: PhotoBatchItem[];
	/**
	 * The turned and adjusted preview for each photo, keyed by item id, once the user has
	 * edited it. Grid cards render this instead of the raw file so a rotation or a
	 * detection change is visible on the thumbnail.
	 */
	previewUrls?: Map<string, string>;
}

/** Starts an empty batch. Order is item order, which is also insertion order. */
export function createPhotoBatch(): PhotoBatch {
	return { items: [], previewUrls: new Map<string, string>() };
}

/** The picture a grid card should show for one photo. */
export function photoBatchPreviewUrl(batch: PhotoBatch, item: PhotoBatchItem): string {
	return batch.previewUrls?.get(item.id) ?? item.thumbnailUrl;
}

/**
 * Replaces a photo's edited preview, freeing the previous one.
 *
 * The raw file URL is never revoker'd here; it is owned by the item and released in
 * disposePhotoBatch.
 */
export function setPhotoBatchPreviewUrl(batch: PhotoBatch, itemId: string, previewUrl: string): void {
	if (!batch.previewUrls) batch.previewUrls = new Map<string, string>();
	const previousUrl = batch.previewUrls.get(itemId);
	if (previousUrl) URL.revokeObjectURL(previousUrl);
	batch.previewUrls.set(itemId, previewUrl);
}

/**
 * Appends picked photos as handwriting. The grid can flip any of them later,
 * and new picks land after the photos already queued.
 */
export function addPhotosToBatch(batch: PhotoBatch, files: File[]): PhotoBatchItem[] {
	const added: PhotoBatchItem[] = [];
	for (const file of files) {
		const item: PhotoBatchItem = {
			id: crypto.randomUUID(),
			file,
			thumbnailUrl: URL.createObjectURL(file),
			target: 'writing',
			detectedCorners: null,
			pinnedPage: null,
			settings: null,
			convertedTarget: null,
			thumbnailAspectRatio: null,
			thumbnailCorners: null,
		};
		batch.items.push(item);
		added.push(item);
	}
	return added;
}

/** Removes a photo and frees its thumbnail. Converted photos are kept. */
export function removePhotoFromBatch(batch: PhotoBatch, itemId: string): void {
	const item = findPhotoBatchItem(batch, itemId);
	if (!item) return;
	if (item.convertedTarget) return;
	const index = batch.items.indexOf(item);
	if (index < 0) return;
	batch.items.splice(index, 1);
	URL.revokeObjectURL(item.thumbnailUrl);
	const previewUrl = batch.previewUrls?.get(itemId);
	if (previewUrl) {
		URL.revokeObjectURL(previewUrl);
		batch.previewUrls?.delete(itemId);
	}
}

/**
 * Reorders the batch to match `orderedItemIds`. SortableJS reports the new order as a
 * list of ids, which is how the Project Browser settings lists persist their order.
 * Ids that are no longer in the batch are ignored so a stale drop cannot re-add a photo.
 *
 * Returns true only when the order really changed. SortableJS also reports the order
 * once on mount, and re-rendering from inside that call would render during a render.
 */
export function applyPhotoBatchOrder(batch: PhotoBatch, orderedItemIds: string[]): boolean {
	const reorderedItems: PhotoBatchItem[] = [];
	for (const itemId of orderedItemIds) {
		const item = findPhotoBatchItem(batch, itemId);
		if (!item) continue;
		reorderedItems.push(item);
	}
	// A partial order would silently drop photos the drag never touched.
	if (reorderedItems.length !== batch.items.length) return false;
	const isUnchanged = reorderedItems.every((item, index) => item === batch.items[index]);
	if (isUnchanged) return false;
	batch.items = reorderedItems;
	return true;
}

/** Sets one photo's writing or drawing destination. Converted photos are locked. */
export function setPhotoBatchTarget(
	batch: PhotoBatch,
	itemId: string,
	target: InkPhotoConvertTarget,
): void {
	const item = findPhotoBatchItem(batch, itemId);
	if (!item) return;
	if (item.convertedTarget) return;
	item.target = target;
}

/** Applies one destination to every photo that has not been converted yet. */
export function setAllPhotoBatchTargets(batch: PhotoBatch, target: InkPhotoConvertTarget): void {
	for (const item of batch.items) {
		// Keep the destination of photos that are already in the note, so the grid
		// never claims a converted drawing is now handwriting.
		if (item.convertedTarget) continue;
		item.target = target;
	}
}

/** Records that a photo has been written into the note. */
export function markPhotoBatchItemConverted(
	item: PhotoBatchItem,
	target: InkPhotoConvertTarget,
): void {
	item.convertedTarget = target;
}

/**
 * Records the corners the user confirmed, so Convert all respects them. A settings
 * object from an earlier pass keeps its sliders but adopts the new page shape.
 */
export function pinPhotoBatchPage(
	item: PhotoBatchItem,
	corners: PhotoCornerQuad,
	quarterTurnsClockwise: number,
): void {
	item.pinnedPage = { corners, quarterTurnsClockwise };
	if (!item.settings) return;
	item.settings.corners = corners;
	item.settings.quarterTurnsClockwise = quarterTurnsClockwise;
}

/**
 * Stores the photo's shape and the page corners drawn on its thumbnail.
 *
 * `corners` are already in the turned photo's coordinate space, which is what the page
 * modal hands back and what the thumbnail image shows. They must not be rotated again
 * here: doing so double-applied the turn and pushed every pin out of the photo.
 */
export function setPhotoBatchThumbnailPage(
	item: PhotoBatchItem,
	turnedWidth: number,
	turnedHeight: number,
	corners: PhotoCornerQuad,
): void {
	if (turnedWidth <= 0 || turnedHeight <= 0) return;
	item.thumbnailAspectRatio = turnedWidth / turnedHeight;
	item.thumbnailCorners = corners.map((point) => ({
		x: point.x / turnedWidth,
		y: point.y / turnedHeight,
	})) as NormalizedPageQuad;
}

/** Number of photos still waiting to be converted. */
export function countPendingPhotos(batch: PhotoBatch): number {
	let pendingCount = 0;
	for (const item of batch.items) {
		if (item.convertedTarget) continue;
		pendingCount += 1;
	}
	return pendingCount;
}

/**
 * Index of the next photo that still needs converting, searching forward from
 * `fromIndex` and then wrapping once. Returns -1 when everything is converted.
 */
export function findNextPendingPhotoIndex(batch: PhotoBatch, fromIndex: number): number {
	const itemCount = batch.items.length;
	if (itemCount === 0) return -1;
	for (let offset = 0; offset < itemCount; offset++) {
		const index = (fromIndex + offset) % itemCount;
		if (batch.items[index].convertedTarget) continue;
		return index;
	}
	return -1;
}

/** Releases every thumbnail and preview URL. Call once the wizard closes for good. */
export function disposePhotoBatch(batch: PhotoBatch): void {
	for (const item of batch.items) {
		URL.revokeObjectURL(item.thumbnailUrl);
	}
	if (batch.previewUrls) {
		for (const previewUrl of batch.previewUrls.values()) {
			URL.revokeObjectURL(previewUrl);
		}
		batch.previewUrls.clear();
	}
	batch.items = [];
}

/** Looks up a photo by id; null when it was removed. */
export function findPhotoBatchItem(batch: PhotoBatch, itemId: string): PhotoBatchItem | null {
	for (const item of batch.items) {
		if (item.id === itemId) return item;
	}
	return null;
}

/** Human label for a photo's position, such as "Photo 2 of 5". */
export function photoBatchStepLabel(batch: PhotoBatch, itemId: string): string {
	const index = batch.items.findIndex((item) => item.id === itemId);
	if (index < 0) return `Photo 1 of ${Math.max(1, batch.items.length)}`;
	return `Photo ${index + 1} of ${batch.items.length}`;
}

/** Centred count on an adjust step, such as "2 of 5 photos". */
export function photoBatchPositionLabel(batch: PhotoBatch, itemId: string): string {
	const index = batch.items.findIndex((item) => item.id === itemId);
	const position = index < 0 ? 1 : index + 1;
	const total = Math.max(1, batch.items.length);
	return `${position} of ${total} photos`;
}
