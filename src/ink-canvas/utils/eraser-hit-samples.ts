import { ERASER_RING_SAMPLE_COUNT, ERASER_SPARSE_RING_SAMPLE_COUNT, ERASER_SPARSE_SWEEP_SAMPLE_SPACING_REFERENCE } from '../constants/erase-tool';
import {
	eraserHitRadiusScreenPx,
	eraserSweepSpacingScreenPx,
	screenConstantMetricForCameraZoom,
} from '../stroke-zoom-scale';

export interface ClientPoint {
	x: number;
	y: number;
}

/**
 * Dense samples of the filled eraser disk and the capsule swept since the last
 * probe. The previous disk was already tested; only newly covered positions need
 * hit tests. With dense detection disabled, restore the original center/ring
 * sampling. Hit radius, layer selection and deletion timing are unchanged.
 */
export function getEraserClientSamplePoints(
	clientX: number,
	clientY: number,
	lastClientPoint: ClientPoint | null,
	cameraZoom: number,
	denseDetection = true,
): ClientPoint[] {
	if (!denseDetection) return getSparseEraserClientSamplePoints(clientX, clientY, lastClientPoint, cameraZoom);
	const radius = eraserHitRadiusScreenPx(cameraZoom);
	const spacing = eraserSweepSpacingScreenPx(cameraZoom);
	const radiusSq = radius * radius;
	const seen = new Set<string>();
	const samples: ClientPoint[] = [];

	const add = (x: number, y: number): void => {
		if (lastClientPoint) {
			const dx = x - lastClientPoint.x;
			const dy = y - lastClientPoint.y;
			if (dx * dx + dy * dy <= radiusSq + 1e-6) return;
		}
		const key = `${x.toFixed(1)},${y.toFixed(1)}`;
		if (seen.has(key)) return;
		seen.add(key);
		samples.push({ x, y });
	};

	// Anchor the interior grid to screen coordinates so consecutive disks reuse
	// exactly the same samples where they overlap, including subpixel movements.
	add(clientX, clientY);
	const firstRow = Math.ceil((clientY - radius) / spacing);
	const lastRow = Math.floor((clientY + radius) / spacing);
	for (let row = firstRow; row <= lastRow; row++) {
		const y = row * spacing;
		const halfWidth = Math.sqrt(Math.max(0, radiusSq - (y - clientY) ** 2));
		const firstColumn = Math.ceil((clientX - halfWidth) / spacing);
		const lastColumn = Math.floor((clientX + halfWidth) / spacing);
		for (let column = firstColumn; column <= lastColumn; column++) {
			add(column * spacing, y);
		}
	}
	// Preserve the exact circular boundary as well as the dense interior grid.
	for (let index = 0; index < ERASER_RING_SAMPLE_COUNT; index++) {
		const angle = (2 * Math.PI * index) / ERASER_RING_SAMPLE_COUNT;
		add(clientX + radius * Math.cos(angle), clientY + radius * Math.sin(angle));
	}

	if (lastClientPoint) {
		const dx = clientX - lastClientPoint.x;
		const dy = clientY - lastClientPoint.y;
		const distance = Math.hypot(dx, dy);
		if (distance > 0) {
			// Sample the swept rectangle once, rather than stamping hundreds of
			// overlapping filled disks for each pointer event.
			const steps = Math.ceil(distance / spacing);
			const crossSteps = Math.ceil((2 * radius) / spacing);
			for (let step = 1; step <= steps; step++) {
				const t = step / steps;
				const centerX = lastClientPoint.x + dx * t;
				const centerY = lastClientPoint.y + dy * t;
				for (let cross = 0; cross <= crossSteps; cross++) {
					const offset = -radius + (2 * radius * cross) / crossSteps;
					const x = centerX - (dy / distance) * offset;
					const y = centerY + (dx / distance) * offset;
					// The endpoint disk above already covers this part of the sweep.
					if ((x - clientX) ** 2 + (y - clientY) ** 2 <= radiusSq + 1e-6) continue;
					add(x, y);
				}
			}
		}
	}
	return samples;
}

/** Original center + eight ring probes, repeated at the old sweep spacing. */
function getSparseEraserClientSamplePoints(
	clientX: number,
	clientY: number,
	lastClientPoint: ClientPoint | null,
	cameraZoom: number,
): ClientPoint[] {
	const hitRadius = eraserHitRadiusScreenPx(cameraZoom);
	const sweepSpacing = screenConstantMetricForCameraZoom(ERASER_SPARSE_SWEEP_SAMPLE_SPACING_REFERENCE, cameraZoom);

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
	for (let ringIndex = 0; ringIndex < ERASER_SPARSE_RING_SAMPLE_COUNT; ringIndex++) {
		const angle = (2 * Math.PI * ringIndex) / ERASER_SPARSE_RING_SAMPLE_COUNT;
		add(centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle));
	}
}
