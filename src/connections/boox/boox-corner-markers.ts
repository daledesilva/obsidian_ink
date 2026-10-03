import { getBooxEmbedCornerRadiusCssPx } from 'src/connections/boox/boox-embed-corner-radius';

/** Bracket stroke width (client CSS px) for writing and drawing embeds on Boox. */
export const BOOX_EMBED_CORNER_MARKER_WIDTH = 3;

export type BooxCornerMarkers = {
	width?: number;
	radius?: number;
	topLeft?: boolean;
	topRight?: boolean;
	bottomLeft?: boolean;
	bottomRight?: boolean;
	showWhenCropped?: boolean;
	radiusWhenCropped?: number;
};

/**
 * Builds nested cornerMarkers for Boox drawing-area WebSocket payloads.
 * Embeds send bracket width + computed border-radius; dedicated views hide all corners.
 * Drawing embed hides bottomRight (resize handle). Crop pair omitted — Bridge defaults apply.
 */
export function buildBooxCornerMarkers(options: {
	wrapper: HTMLElement;
	isDedicatedView: boolean;
	hideBottomRightCorner?: boolean;
}): BooxCornerMarkers {
	if (options.isDedicatedView) {
		// Full-screen editors have no embed frame to align — hide brackets so they do not clutter the canvas.
		return {
			topLeft: false,
			topRight: false,
			bottomLeft: false,
			bottomRight: false,
		};
	}

	const cornerMarkers: BooxCornerMarkers = {
		width: BOOX_EMBED_CORNER_MARKER_WIDTH,
		radius: getBooxEmbedCornerRadiusCssPx(options.wrapper),
	};

	if (options.hideBottomRightCorner) {
		cornerMarkers.bottomRight = false;
	}

	return cornerMarkers;
}
