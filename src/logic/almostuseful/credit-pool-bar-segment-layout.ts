/////////
/////////

export interface CreditPoolStackSegmentLayoutInput {
	key: string;
	/** Segment data value — must be > 0 to enforce the minimum painted height. */
	value: number;
	topPx: number;
	bottomPx: number;
}

export interface CreditPoolStackSegmentLayoutOutput {
	key: string;
	topPx: number;
	heightPx: number;
}

/**
 * Enforces a minimum pixel height per non-zero stack segment.
 * Inflated segments grow upward and shift every segment above by the same delta.
 */
export function layoutCreditPoolStackSegmentsWithMinimumHeight(
	segments: readonly CreditPoolStackSegmentLayoutInput[],
	minSegmentPx: number,
): CreditPoolStackSegmentLayoutOutput[] {
	if (!segments.length) return [];

	const adjusted = segments.map((segment) => ({
		key: segment.key,
		value: segment.value,
		topPx: segment.topPx,
		bottomPx: segment.bottomPx,
	}));

	// Bottom segment in SVG coordinates has the largest bottomPx.
	adjusted.sort((left, right) => right.bottomPx - left.bottomPx);

	for (let index = 0; index < adjusted.length; index += 1) {
		const segment = adjusted[index];
		const heightPx = segment.bottomPx - segment.topPx;
		if (segment.value <= 0 || heightPx >= minSegmentPx) continue;

		const delta = minSegmentPx - heightPx;
		segment.topPx -= delta;

		for (let aboveIndex = index + 1; aboveIndex < adjusted.length; aboveIndex += 1) {
			adjusted[aboveIndex].topPx -= delta;
			adjusted[aboveIndex].bottomPx -= delta;
		}
	}

	return adjusted.map((segment) => ({
		key: segment.key,
		topPx: segment.topPx,
		heightPx: segment.bottomPx - segment.topPx,
	}));
}

/** Applies a minimum pixel height to a single bar when value is positive. */
export function layoutCreditPoolSingleBarWithMinimumHeight(
	topPx: number,
	bottomPx: number,
	value: number,
	minSegmentPx: number,
): { topPx: number; heightPx: number } {
	const naturalHeightPx = bottomPx - topPx;
	if (value <= 0 || naturalHeightPx >= minSegmentPx) {
		return { topPx, heightPx: naturalHeightPx };
	}

	const heightPx = minSegmentPx;
	return {
		topPx: bottomPx - heightPx,
		heightPx,
	};
}
