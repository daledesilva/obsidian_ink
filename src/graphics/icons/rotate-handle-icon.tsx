import * as React from 'react';

export type RotateHandleIconDirection = 'clockwise' | 'counterclockwise';

type RotateHandleIconProps = React.SVGProps<SVGSVGElement> & {
	direction?: RotateHandleIconDirection;
};

/** Lucide `redo` / `undo` — https://lucide.dev/icons/redo (CW) and undo (CCW). */
export const RotateHandleIcon = (props: RotateHandleIconProps) => {
	const { direction = 'clockwise', ...svgProps } = props;
	const isCounterclockwise = direction === 'counterclockwise';

	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			width={24}
			height={24}
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
			{...svgProps}
		>
			{isCounterclockwise ? (
				<>
					<path d="M3 7v6h6" />
					<path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
				</>
			) : (
				<>
					<path d="M21 7v6h-6" />
					<path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
				</>
			)}
		</svg>
	);
};
