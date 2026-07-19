import { ERASER_RING_SAMPLE_COUNT } from '../constants/erase-tool';
import {
	eraserHitRadiusScreenPx,
	eraserSweepSpacingScreenPx,
} from '../stroke-zoom-scale';

export interface ClientPoint {
	x: number;
	y: number;
}

/**
 * Screen-space sample points for one eraser probe: optional sweep along the move
 * segment, plus a full-radius pattern at each sample (scaled for camera zoom).
 */
export function getEraserClientSamplePoints(
	clientX: number,
	clientY: number,
	lastClientPoint: ClientPoint | null,
	cameraZoom: number,
): ClientPoint[] {
	const hitRadius = eraserHitRadiusScreenPx(cameraZoom);
	const sweepSpacing = eraserSweepSpacingScreenPx(cameraZoom);

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
		const stepCount = Math.max(1, Math.ceil(distance / sweepSpacing));
		for (let stepIndex = 0; stepIndex <= stepCount; stepIndex++) {
			const t = stepIndex / stepCount;
			appendRadiusPatternSamples(
				add,
				lastClientPoint.x + dx * t,
				lastClientPoint.y + dy * t,
				hitRadius,
			);
		}
	} else {
		appendRadiusPatternSamples(add, clientX, clientY, hitRadius);
	}

	return samples;
}

function appendRadiusPatternSamples(
	add: (x: number, y: number) => void,
	centerX: number,
	centerY: number,
	radius: number,
): void {
	add(centerX, centerY);
	for (let ringIndex = 0; ringIndex < ERASER_RING_SAMPLE_COUNT; ringIndex++) {
		const angle = (2 * Math.PI * ringIndex) / ERASER_RING_SAMPLE_COUNT;
		add(centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle));
	}
}
