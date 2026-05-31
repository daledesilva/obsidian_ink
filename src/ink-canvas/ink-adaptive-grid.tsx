import React, { useId } from 'react';

///////////////////////////
///////////////////////////

/** Matches legacy tldraw document.gridSize default. */
export const INK_GRID_SIZE = 10;

/** Multi-scale grid layers from tldraw defaultTldrawOptions.gridSteps. */
export const INK_GRID_STEPS = [
	{ min: -1, mid: 0.15, step: 64 },
	{ min: 0.05, mid: 0.375, step: 16 },
	{ min: 0.15, mid: 1, step: 4 },
	{ min: 0.7, mid: 2.5, step: 1 },
] as const;

/**
 * Peak opacity per tier when a layer is fully visible (tiers 0–3).
 */
const INK_GRID_TIER_PEAK_OPACITY = [1, 0.6, 0.35, 0.25] as const;

/** Dot radius in screen pixels — tiers 2–3 are larger for stronger visibility. */
const INK_GRID_TIER_DOT_RADIUS = [1, 1, 1.25, 1.5] as const;

function modulate(
	value: number,
	rangeA: readonly [number, number],
	rangeB: readonly [number, number],
): number {
	const [fromLow, fromHigh] = rangeA;
	const [toLow, toHigh] = rangeB;
	return toLow + ((value - fromLow) / (fromHigh - fromLow)) * (toHigh - toLow);
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

/**
 * Coarse tiers (0–1) stay at peak opacity once zoom clears `min` so they remain
 * reference points when zooming in. Fine tiers (2–3) fade out when zooming out below `mid`.
 */
function computeLayerOpacity(
	tierIndex: number,
	z: number,
	min: number,
	mid: number,
): number {
	const peak = INK_GRID_TIER_PEAK_OPACITY[tierIndex] ?? 1;

	if (tierIndex <= 1) {
		if (z < min) {
			return clamp01(modulate(z, [Math.min(min, -1), min], [0, peak]));
		}
		return peak;
	}

	if (z < mid) {
		return clamp01(modulate(z, [min, mid], [0, peak]));
	}
	return peak;
}

export interface InkAdaptiveGridProps {
	x: number;
	y: number;
	z: number;
	gridSize?: number;
	className?: string;
}

/**
 * Screen-space adaptive dot grid (ported from tldraw DefaultGrid).
 * Must render as a sibling of the camera-transformed stroke group, not inside it.
 */
export function InkAdaptiveGrid(props: InkAdaptiveGridProps): React.JSX.Element {
	const { x, y, z, gridSize = INK_GRID_SIZE, className } = props;
	const reactId = useId();
	const patternIdPrefix = `ink_grid_${reactId.replace(/:/g, '')}`;

	return (
		<g className={className ?? 'ink-adaptive-grid'} pointerEvents="none">
			<defs>
				{INK_GRID_STEPS.map(({ min, mid, step }, tierIndex) => {
					const cellSize = step * gridSize * z;
					const xOffset = 0.5 + x * z;
					const yOffset = 0.5 + y * z;
					const gridXOrigin = xOffset > 0 ? xOffset % cellSize : cellSize + (xOffset % cellSize);
					const gridYOrigin = yOffset > 0 ? yOffset % cellSize : cellSize + (yOffset % cellSize);
					const opacity = computeLayerOpacity(tierIndex, z, min, mid);
					const dotRadius = INK_GRID_TIER_DOT_RADIUS[tierIndex] ?? 1;

					return (
						<pattern
							key={tierIndex}
							id={`${patternIdPrefix}_${step}`}
							width={cellSize}
							height={cellSize}
							patternUnits="userSpaceOnUse"
						>
							<circle
								className="ink-grid-dot"
								data-ink-grid-tier={tierIndex}
								cx={gridXOrigin}
								cy={gridYOrigin}
								r={dotRadius}
								opacity={opacity}
							/>
						</pattern>
					);
				})}
			</defs>
			{INK_GRID_STEPS.map(({ step }, tierIndex) => (
				<rect
					key={tierIndex}
					x="0"
					y="0"
					width="100%"
					height="100%"
					fill={`url(#${patternIdPrefix}_${step})`}
				/>
			))}
		</g>
	);
}
