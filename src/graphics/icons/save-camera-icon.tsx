import * as React from "react";

export const SaveCameraIcon: React.FC = () => {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{/* Camera body */}
			<path d="M4 8a2 2 0 0 1 2-2h2l1-2h6l1 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
			<circle cx="12" cy="13" r="3" />

			{/* Save badge (check) */}
			<path d="M16.5 10.5l1.2 1.2 2.3-2.3" />
		</svg>
	);
};

export default SaveCameraIcon;

