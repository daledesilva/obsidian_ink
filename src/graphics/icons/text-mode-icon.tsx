import * as React from 'react';

//////////
//////////

// https://lucide.dev/icons/case-sensitive

/** Lucide case-sensitive — switch locked embed to transcript view (path-based, no SVG text nodes). */
export const TextModeIcon = (props: React.SVGProps<SVGSVGElement>) => (
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
		<path d='m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16' />
		<path d='M22 9v7' />
		<path d='M3.304 13h6.392' />
		<circle cx='18.5' cy='12.5' r='3.5' />
	</svg>
);
