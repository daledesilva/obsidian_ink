import { getBooxEmbedCornerRadiusCssPx } from 'src/connections/boox/boox-embed-corner-radius';

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
 * Embed uses computed border-radius; dedicated views use radius 0 (square chrome).
 * Drawing embed hides bottomRight (resize handle). Crop pair omitted — Bridge defaults apply.
 */
export function buildBooxCornerMarkers(options: {
	wrapper: HTMLElement;
	isDedicatedView: boolean;
	hideBottomRightCorner?: boolean;
}): BooxCornerMarkers {
	if (options.isDedicatedView) {
		return { radius: 0 };
	}

	const cornerMarkers: BooxCornerMarkers = {
		radius: getBooxEmbedCornerRadiusCssPx(options.wrapper),
	};

	if (options.hideBottomRightCorner) {
		cornerMarkers.bottomRight = false;
	}

	return cornerMarkers;
}
