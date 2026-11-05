import type { DominantHand } from 'src/types/plugin-settings_0_5_0';
import type { StrokeBounds } from './svg-export';
import { selectionBoundsCenter } from './selection-bounds';
import { SELECTION_HANDLE_HIT_RADIUS_SCREEN_PX } from './selection-bounds';
import type { SelectionHandleKind, SelectionHandlePositions } from './selection-bounds';

export { SELECTION_HANDLE_HIT_RADIUS_SCREEN_PX };

///////////////////////////
///////////////////////////

/** Oriented selection frame persisted until the selection is cleared. */
export interface SelectionChrome {
	center: { x: number; y: number };
	width: number;
	height: number;
	/** Cumulative rotation of the chrome (and committed ink) while this selection is active. */
	rotationRad: number;
}

export function selectionChromeFromBounds(bounds: StrokeBounds): SelectionChrome {
	return {
		center: selectionBoundsCenter(bounds),
		width: bounds.width,
		height: bounds.height,
		rotationRad: 0,
	};
}

function rotatePagePointAround(
	point: { x: number; y: number },
	center: { x: number; y: number },
	rotationRad: number,
): { x: number; y: number } {
	const cos = Math.cos(rotationRad);
	const sin = Math.sin(rotationRad);
	const dx = point.x - center.x;
	const dy = point.y - center.y;
	return {
		x: center.x + dx * cos - dy * sin,
		y: center.y + dx * sin + dy * cos,
	};
}

/** Map a page-space pointer into the chrome's unrotated local frame (centered on chrome.center). */
export function pagePointToChromeLocal(
	pagePoint: { x: number; y: number },
	chrome: SelectionChrome,
): { x: number; y: number } {
	const cos = Math.cos(-chrome.rotationRad);
	const sin = Math.sin(-chrome.rotationRad);
	const dx = pagePoint.x - chrome.center.x;
	const dy = pagePoint.y - chrome.center.y;
	return {
		x: dx * cos - dy * sin,
		y: dx * sin + dy * cos,
	};
}

/** True when a page point lies inside the oriented selection rectangle. */
export function isPagePointInChrome(
	pagePoint: { x: number; y: number },
	chrome: SelectionChrome,
): boolean {
	const local = pagePointToChromeLocal(pagePoint, chrome);
	const halfW = chrome.width / 2;
	const halfH = chrome.height / 2;
	return local.x >= -halfW && local.x <= halfW && local.y >= -halfH && local.y <= halfH;
}

/** Handle centers in chrome-local space (origin at chrome center, before rotation). */
export function getChromeHandlePositionsLocal(
	chrome: SelectionChrome,
	dominantHand: DominantHand,
): Pick<SelectionHandlePositions, 'resize' | 'rotate'> {
	const halfW = chrome.width / 2;
	const halfH = chrome.height / 2;

	if (dominantHand === 'left') {
		return {
			resize: { x: -halfW, y: halfH },
			rotate: { x: -halfW, y: -halfH },
		};
	}

	return {
		resize: { x: halfW, y: halfH },
		rotate: { x: halfW, y: -halfH },
	};
}

/** Corner handle centers in page space (resize + rotate dots on bbox corners). */
export function getChromeHandlePositions(
	chrome: SelectionChrome,
	dominantHand: DominantHand,
): SelectionHandlePositions {
	const pivot = chrome.center;
	const local = getChromeHandlePositionsLocal(chrome, dominantHand);

	return {
		pivot,
		resize: rotatePagePointAround(
			{ x: pivot.x + local.resize.x, y: pivot.y + local.resize.y },
			pivot,
			chrome.rotationRad,
		),
		rotate: rotatePagePointAround(
			{ x: pivot.x + local.rotate.x, y: pivot.y + local.rotate.y },
			pivot,
			chrome.rotationRad,
		),
	};
}

export function hitTestChromeHandle(
	pagePoint: { x: number; y: number },
	chrome: SelectionChrome,
	dominantHand: DominantHand,
	tolerancePageUnits: number,
): SelectionHandleKind | null {
	const handles = getChromeHandlePositions(chrome, dominantHand);
	const resizeDist = Math.hypot(pagePoint.x - handles.resize.x, pagePoint.y - handles.resize.y);
	if (resizeDist <= tolerancePageUnits) return 'resize';

	const rotateDist = Math.hypot(pagePoint.x - handles.rotate.x, pagePoint.y - handles.rotate.y);
	if (rotateDist <= tolerancePageUnits) return 'rotate';

	return null;
}

export function translateSelectionChrome(
	chrome: SelectionChrome,
	deltaX: number,
	deltaY: number,
): SelectionChrome {
	return {
		...chrome,
		center: {
			x: chrome.center.x + deltaX,
			y: chrome.center.y + deltaY,
		},
	};
}

export function applyScaleToSelectionChrome(
	chrome: SelectionChrome,
	scale: number,
): SelectionChrome {
	if (scale === 1) return chrome;
	return {
		...chrome,
		width: chrome.width * scale,
		height: chrome.height * scale,
	};
}

export function applyRotationToSelectionChrome(
	chrome: SelectionChrome,
	rotationRad: number,
): SelectionChrome {
	if (rotationRad === 0) return chrome;
	return {
		...chrome,
		rotationRad: chrome.rotationRad + rotationRad,
	};
}

export interface SelectionChromePreview {
	scale: number;
	rotationRad: number;
	translateX: number;
	translateY: number;
}

export const EMPTY_SELECTION_CHROME_PREVIEW: SelectionChromePreview = {
	scale: 1,
	rotationRad: 0,
	translateX: 0,
	translateY: 0,
};

/** Chrome with live gesture preview layered on committed chrome state. */
export function getEffectiveChrome(
	chrome: SelectionChrome,
	preview: SelectionChromePreview | null,
): SelectionChrome {
	if (!preview) return chrome;
	let next: SelectionChrome = {
		...chrome,
		center: {
			x: chrome.center.x + preview.translateX,
			y: chrome.center.y + preview.translateY,
		},
	};
	if (preview.scale !== 1) next = applyScaleToSelectionChrome(next, preview.scale);
	if (preview.rotationRad !== 0) next = applyRotationToSelectionChrome(next, preview.rotationRad);
	return next;
}
