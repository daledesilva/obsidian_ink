import type { PagePoint } from './find-page-quad';

//////////
//////////

/**
 * Turns raster pixels by 90° steps. Positive quarter turns go clockwise.
 * The corner step, the trace, and the saved vault JPEG share this remap so
 * a turned page stays sharp and stays in the same orientation everywhere.
 */
export function rotateImageDataQuarterTurns(
	source: ImageData,
	quarterTurnsClockwise: number,
): ImageData {
	const turns = normalizeQuarterTurns(quarterTurnsClockwise);
	if (turns === 0) return source;

	const sourceWidth = source.width;
	const sourceHeight = source.height;
	const swapsAxes = turns === 1 || turns === 3;
	let destWidth = sourceWidth;
	let destHeight = sourceHeight;
	if (swapsAxes) {
		destWidth = sourceHeight;
		destHeight = sourceWidth;
	}

	const dest = new ImageData(destWidth, destHeight);
	const sourcePixels = source.data;
	const destPixels = dest.data;
	for (let y = 0; y < sourceHeight; y++) {
		for (let x = 0; x < sourceWidth; x++) {
			const sourceOffset = (y * sourceWidth + x) * 4;
			let destX = x;
			let destY = y;
			if (turns === 1) {
				destX = sourceHeight - 1 - y;
				destY = x;
			} else if (turns === 2) {
				destX = sourceWidth - 1 - x;
				destY = sourceHeight - 1 - y;
			} else {
				destX = y;
				destY = sourceWidth - 1 - x;
			}
			const destOffset = (destY * destWidth + destX) * 4;
			destPixels[destOffset] = sourcePixels[sourceOffset];
			destPixels[destOffset + 1] = sourcePixels[sourceOffset + 1];
			destPixels[destOffset + 2] = sourcePixels[sourceOffset + 2];
			destPixels[destOffset + 3] = sourcePixels[sourceOffset + 3];
		}
	}
	return dest;
}

/**
 * Turns an ordered page quad with the photo.
 * Index 0 stays the corner that should become the top-left after the turn,
 * so the straightened page matches the orientation on screen.
 */
export function rotatePageCornersQuarterTurns(
	corners: [PagePoint, PagePoint, PagePoint, PagePoint],
	width: number,
	height: number,
	quarterTurnsClockwise: number,
): [PagePoint, PagePoint, PagePoint, PagePoint] {
	let current = corners.map((point) => ({ x: point.x, y: point.y })) as [
		PagePoint,
		PagePoint,
		PagePoint,
		PagePoint,
	];
	let currentWidth = width;
	let currentHeight = height;
	let turnsRemaining = quarterTurnsClockwise;
	while (turnsRemaining > 0) {
		const turned = turnCornersOnce(current, currentWidth, currentHeight, true);
		current = turned.corners;
		currentWidth = turned.width;
		currentHeight = turned.height;
		turnsRemaining -= 1;
	}
	while (turnsRemaining < 0) {
		const turned = turnCornersOnce(current, currentWidth, currentHeight, false);
		current = turned.corners;
		currentWidth = turned.width;
		currentHeight = turned.height;
		turnsRemaining += 1;
	}
	return current;
}

/** Maps any integer quarter-turn count onto 0–3 clockwise steps. */
function normalizeQuarterTurns(quarterTurnsClockwise: number): number {
	const turns = quarterTurnsClockwise % 4;
	if (turns < 0) return turns + 4;
	return turns;
}

/** One 90° turn. Clockwise makes the old bottom-left the new top-left. */
function turnCornersOnce(
	corners: [PagePoint, PagePoint, PagePoint, PagePoint],
	width: number,
	height: number,
	clockwise: boolean,
): { corners: [PagePoint, PagePoint, PagePoint, PagePoint]; width: number; height: number } {
	const moved = corners.map((point) => {
		if (clockwise) return { x: height - point.y, y: point.x };
		return { x: point.y, y: width - point.x };
	});
	let ordered: PagePoint[];
	if (clockwise) {
		ordered = [moved[3], moved[0], moved[1], moved[2]];
	} else {
		ordered = [moved[1], moved[2], moved[3], moved[0]];
	}
	return {
		corners: ordered as [PagePoint, PagePoint, PagePoint, PagePoint],
		width: height,
		height: width,
	};
}
