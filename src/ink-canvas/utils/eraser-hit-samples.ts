import {
	ERASER_HIT_RADIUS_SCREEN_PX,
	ERASER_RING_SAMPLE_COUNT,
	ERASER_SWEEP_SAMPLE_SPACING_PX,
} from '../constants/erase-tool';

export interface ClientPoint {
	x: number;
	y: number;
}

/**
 * Screen-space sample points for one eraser probe: optional sweep centers along the
 * move segment, plus a full-radius pattern at the current pointer.
 */
export function getEraserClientSamplePoints(
	clientX: number,
	clientY: number,
	lastClientPoint: ClientPoint | null,
): ClientPoint[] {
	const seen = new Set<string>();
	const samples: ClientPoint[] = [];

	const add = (x: number, y: number): void => {
		const key = `${x.toFixed(1)},${y.toFixed(1)}`;
		if (seen.has(key)) return;
		seen.add(key);
		samples.push({ x, y });
	};

	if (lastClientPoint) {
		const dx = clientX - lastClientPoint.x;
		const dy = clientY - lastClientPoint.y;
		const distance = Math.hypot(dx, dy);
		const stepCount = Math.max(1, Math.ceil(distance / ERASER_SWEEP_SAMPLE_SPACING_PX));
		for (let stepIndex = 0; stepIndex <= stepCount; stepIndex++) {
			const t = stepIndex / stepCount;
			appendRadiusPatternSamples(
				add,
				lastClientPoint.x + dx * t,
				lastClientPoint.y + dy * t,
			);
		}
	} else {
		appendRadiusPatternSamples(add, clientX, clientY);
	}

	return samples;
}

function appendRadiusPatternSamples(
	add: (x: number, y: number) => void,
	centerX: number,
	centerY: number,
): void {
	add(centerX, centerY);
	const radius = ERASER_HIT_RADIUS_SCREEN_PX;
	for (let ringIndex = 0; ringIndex < ERASER_RING_SAMPLE_COUNT; ringIndex++) {
		const angle = (2 * Math.PI * ringIndex) / ERASER_RING_SAMPLE_COUNT;
		add(centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle));
	}
}
