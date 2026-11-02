//////////
//////////

/**
 * What a traced photo becomes. Batch items carry one of these so a single run
 * can mix handwriting pages and drawings in any order.
 */
export type InkPhotoConvertTarget = 'writing' | 'drawing';

/**
 * Where a wizard step sends the user next. `photos` returns to the thumbnail
 * grid, `convert-all` asks for every remaining photo to be finished without the
 * per-photo steps, and the other values step through the ordered queue.
 */
export type PhotoStepNav =
	| 'previous'
	| 'next'
	| 'photos'
	| 'convert-all'
	| 'cancel';
