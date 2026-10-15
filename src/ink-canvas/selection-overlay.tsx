import './selection-overlay.scss';
import * as React from 'react';
import type { DominantHand } from 'src/types/plugin-settings_0_5_0';
import { ResizeDiagonalIcon } from 'src/graphics/icons/resize-diagonal-icon';
import {
	RotateHandleIcon,
	type RotateHandleIconDirection,
} from 'src/graphics/icons/rotate-handle-icon';
import {
	SELECTION_BOUNDS_CORNER_RADIUS_SCREEN_PX,
	SELECTION_HANDLE_HIT_RADIUS_SCREEN_PX,
} from './selection-bounds';
import {
	getChromeHandlePositionsLocal,
	getEffectiveChrome,
	type SelectionChrome,
	type SelectionChromePreview,
} from './selection-chrome';

///////////////////////////
///////////////////////////

export interface SelectionOverlayProps {
	overlayRef: React.Ref<SVGGElement>;
	chrome: SelectionChrome;
	preview: SelectionChromePreview | null;
	cameraZoom: number;
	dominantHand: DominantHand;
	writingMode: boolean;
}

/** Chrome visuals shared by the underlay fill and the on-top overlay. */
export type SelectionChromeVisualProps = Omit<SelectionOverlayProps, 'overlayRef'>;

const RESIZE_ICON_SCREEN_PX = 11;
const ROTATE_ICON_SCREEN_PX = 12;
/** Lucide redo/undo glyph orientation on the rotate handle (clockwise from default). */
const ROTATE_ICON_EXTRA_DEG = 50;
const HANDLE_ICON_VIEW_SIZE = 24;

interface SelectionChromeRectLayout {
	transform: string;
	halfW: number;
	halfH: number;
	width: number;
	height: number;
	cornerRadiusPage: number;
}

function getSelectionChromeRectLayout(props: SelectionChromeVisualProps): SelectionChromeRectLayout {
	const effectiveChrome = getEffectiveChrome(props.chrome, props.preview);
	const cornerRadiusPage = SELECTION_BOUNDS_CORNER_RADIUS_SCREEN_PX / props.cameraZoom;
	const halfW = effectiveChrome.width / 2;
	const halfH = effectiveChrome.height / 2;
	const rotateDeg = (effectiveChrome.rotationRad * 180) / Math.PI;
	const cx = effectiveChrome.center.x;
	const cy = effectiveChrome.center.y;
	return {
		transform: `translate(${cx}, ${cy}) rotate(${rotateDeg})`,
		halfW,
		halfH,
		width: effectiveChrome.width,
		height: effectiveChrome.height,
		cornerRadiusPage,
	};
}

/** Semi-transparent selection fill drawn under committed strokes so ink outlines stay visible. */
export const SelectionBoundsFillUnderlay: React.FC<SelectionChromeVisualProps> = (props) => {
	const layout = getSelectionChromeRectLayout(props);
	return (
		<g className="ink-canvas-selection-bounds-underlay" pointerEvents="none">
			<g transform={layout.transform}>
				<rect
					className="ink-canvas-selection-bounds-fill"
					x={-layout.halfW}
					y={-layout.halfH}
					width={layout.width}
					height={layout.height}
					rx={layout.cornerRadiusPage}
					ry={layout.cornerRadiusPage}
				/>
			</g>
		</g>
	);
};

/** Selection bounding box stroke and drawing-only transform handles (oriented page space). */
export const SelectionOverlay: React.FC<SelectionOverlayProps> = (props) => {
	const effectiveChrome = getEffectiveChrome(props.chrome, props.preview);
	const zoom = props.cameraZoom;
	const layout = getSelectionChromeRectLayout(props);
	const handleRadiusPage = SELECTION_HANDLE_HIT_RADIUS_SCREEN_PX / zoom;
	const resizeIconSizePage = RESIZE_ICON_SCREEN_PX / zoom;
	const rotateIconSizePage = ROTATE_ICON_SCREEN_PX / zoom;
	const handlesLocal = getChromeHandlePositionsLocal(effectiveChrome, props.dominantHand);
	const shouldFlipHandleIcons = props.dominantHand === 'left';

	return (
		<g ref={props.overlayRef} className="ink-canvas-selection-overlay">
			<g transform={layout.transform}>
				<rect
					className="ink-canvas-selection-bounds"
					x={-layout.halfW}
					y={-layout.halfH}
					width={layout.width}
					height={layout.height}
					rx={layout.cornerRadiusPage}
					ry={layout.cornerRadiusPage}
				/>
				{!props.writingMode && (
					<>
						<SelectionCornerHandle
							cx={handlesLocal.resize.x}
							cy={handlesLocal.resize.y}
							r={handleRadiusPage}
							iconSizePage={resizeIconSizePage}
							iconKind="resize"
							flipIconX={shouldFlipHandleIcons}
						/>
						<SelectionCornerHandle
							cx={handlesLocal.rotate.x}
							cy={handlesLocal.rotate.y}
							r={handleRadiusPage}
							iconSizePage={rotateIconSizePage}
							iconKind="rotate"
							extraRotateDeg={
								shouldFlipHandleIcons ? -ROTATE_ICON_EXTRA_DEG : ROTATE_ICON_EXTRA_DEG
							}
							flipIconX={false}
							rotateIconDirection={shouldFlipHandleIcons ? 'counterclockwise' : 'clockwise'}
						/>
					</>
				)}
			</g>
		</g>
	);
};

interface SelectionCornerHandleProps {
	cx: number;
	cy: number;
	r: number;
	iconSizePage: number;
	iconKind: 'resize' | 'rotate';
	extraRotateDeg?: number;
	/** Mirror glyphs when handles sit on the left edge (left-handed dominant hand). */
	flipIconX?: boolean;
	rotateIconDirection?: RotateHandleIconDirection;
}

function SelectionCornerHandle(props: SelectionCornerHandleProps): React.JSX.Element {
	const extraRotate = props.extraRotateDeg ?? 0;
	const iconScale = props.iconSizePage / HANDLE_ICON_VIEW_SIZE;
	const iconScaleX = (props.flipIconX ? -1 : 1) * iconScale;
	return (
		<g transform={`translate(${props.cx}, ${props.cy})`}>
			<circle className="ink-canvas-selection-handle-dot" cx={0} cy={0} r={props.r} />
			<g
				className={`ink-canvas-selection-handle-icon ink-canvas-selection-handle-icon--${props.iconKind}`}
				transform={`rotate(${extraRotate}) scale(${iconScaleX}, ${iconScale}) translate(${-HANDLE_ICON_VIEW_SIZE / 2}, ${-HANDLE_ICON_VIEW_SIZE / 2})`}
			>
				{props.iconKind === 'resize' ? (
					<ResizeDiagonalIcon width={HANDLE_ICON_VIEW_SIZE} height={HANDLE_ICON_VIEW_SIZE} />
				) : (
					<RotateHandleIcon
						width={HANDLE_ICON_VIEW_SIZE}
						height={HANDLE_ICON_VIEW_SIZE}
						direction={props.rotateIconDirection ?? 'clockwise'}
					/>
				)}
			</g>
		</g>
	);
}
