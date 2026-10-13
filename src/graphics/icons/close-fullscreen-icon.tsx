import * as React from "react";

//////////
//////////

// Pair of ExpandIcon (Material Symbols collapse_content), rotated 90° CCW.
// https://fonts.google.com/icons?selected=Material+Symbols+Rounded:collapse_content

export const CloseFullscreenIcon = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		height={24}
		viewBox="0 -960 960 960"
		width={24}
		{...props}
	>
		<g transform="rotate(-90 480 -480)">
			<path d="M360-360H240q-17 0-28.5-11.5T200-400q0-17 11.5-28.5T240-440h160q17 0 28.5 11.5T440-400v160q0 17-11.5 28.5T400-200q-17 0-28.5-11.5T360-240v-120Zm240-240h120q17 0 28.5 11.5T760-560q0 17-11.5 28.5T720-520H560q-17 0-28.5-11.5T520-560v-160q0-17 11.5-28.5T560-760q17 0 28.5 11.5T600-720v120Z" />
		</g>
	</svg>
);
