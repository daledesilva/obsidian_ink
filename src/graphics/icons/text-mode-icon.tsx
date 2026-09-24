import * as React from 'react';

//////////
//////////

/** Capital A + lowercase a — switch locked embed to transcript view. */
export const TextModeIcon = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		xmlns='http://www.w3.org/2000/svg'
		viewBox='0 0 24 24'
		width={24}
		height={24}
		aria-hidden='true'
		{...props}
	>
		<text
			x='3'
			y='17'
			fontSize='13'
			fontWeight='600'
			fill='currentColor'
			fontFamily='var(--font-interface)'
		>
			A
		</text>
		<text
			x='13'
			y='17'
			fontSize='10'
			fontWeight='500'
			fill='currentColor'
			fontFamily='var(--font-interface)'
		>
			a
		</text>
	</svg>
);
