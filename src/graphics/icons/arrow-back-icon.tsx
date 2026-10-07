import * as React from "react";

//////////
//////////

// Material Symbols arrow_back, same filled 960-grid as the other ink menu icons.
// https://fonts.google.com/icons?selected=Material+Symbols+Rounded:arrow_back

export const ArrowBackIcon = (props: React.SVGProps<SVGSVGElement>) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		height={24}
		viewBox="0 -960 960 960"
		width={24}
		{...props}
	>
		<path d="M313-440l224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z" />
	</svg>
);
