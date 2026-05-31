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

export interface InkAdaptiveGridProps {
	x: number;
	y: number;
	z: number;
	gridSize?: number;
	className?: string;
}

function modulate(
	value: number,
	rangeA: readonly [number, number],
	rangeB: readonly [number, number],
): number {
	const [fromLow, fromHigh] = rangeA;
	const [toLow, toHigh] = rangeB;
	return toLow + ((value - fromLow) / (fromHigh - fromLow)) * (toHigh - toLow);
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
				{INK_GRID_STEPS.map(({ min, mid, step }, i) => {
					const cellSize = step * gridSize * z;
					const xOffset = 0.5 + x * z;
					const yOffset = 0.5 + y * z;
					const gridXOrigin = xOffset > 0 ? xOffset % cellSize : cellSize + (xOffset % cellSize);
					const gridYOrigin = yOffset > 0 ? yOffset % cellSize : cellSize + (yOffset % cellSize);
					const opacity = z < mid ? modulate(z, [min, mid], [0, 1]) : 1;

					return (
						<pattern
							key={i}
							id={`${patternIdPrefix}_${step}`}
							width={cellSize}
							height={cellSize}
							patternUnits="userSpaceOnUse"
						>
							<circle
								className="ink-grid-dot"
								cx={gridXOrigin}
								cy={gridYOrigin}
								r={1}
								opacity={opacity}
							/>
						</pattern>
					);
				})}
			</defs>
			{INK_GRID_STEPS.map(({ step }, i) => (
				<rect
					key={i}
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
