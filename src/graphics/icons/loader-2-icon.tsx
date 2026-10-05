import * as React from 'react';

//////////
//////////

// https://lucide.dev/icons/loader-2

/** Lucide loader-2 — stroke-only spinner for transcription in progress. */
export const Loader2Icon = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		xmlns='http://www.w3.org/2000/svg'
		width='1em'
		height='1em'
		viewBox='0 0 24 24'
		fill='none'
		stroke='currentColor'
		strokeWidth='2'
		strokeLinecap='round'
		strokeLinejoin='round'
		aria-hidden='true'
		{...props}
	>
		<path d='M21 12a9 9 0 1 1-6.219-8.56' />
	</svg>
);
