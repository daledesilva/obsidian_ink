import * as React from 'react';

/////
/////

// https://lucide.dev/icons/check

// Finish-editing control in embed toolbars — stroke-only Lucide check, not a filled lock icon.
/** Lucide check (tick) — stroke only, no fill. */
export const CheckIcon = (props: React.SVGProps<SVGSVGElement>) => (
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
		<path d="M20 6 9 17l-5-5" />
	</svg>
);
