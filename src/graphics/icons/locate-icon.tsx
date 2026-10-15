import * as React from 'react';

/////
/////

// https://lucide.dev/icons/locate

/** Lucide locate — dedicated-view control that reveals the ink file in the explorer. */
export const LocateIcon = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="1em"
		height="1em"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		{...props}
	>
		<line x1="2" x2="5" y1="12" y2="12" />
		<line x1="19" x2="22" y1="12" y2="12" />
		<line x1="12" x2="12" y1="2" y2="5" />
		<line x1="12" x2="12" y1="19" y2="22" />
		<circle cx="12" cy="12" r="7" />
		<circle cx="12" cy="12" r="3" />
	</svg>
);
