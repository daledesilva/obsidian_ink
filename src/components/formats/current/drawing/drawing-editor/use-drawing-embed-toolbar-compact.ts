import * as React from 'react';
import {
	drawingToolbarClustersOverlap,
	isVisibleToolbarClusterRect,
} from 'src/logic/utils/toolbar-cluster-overlap';

//////////
//////////

export const DRAWING_EMBED_TOOLBAR_COMPACT_CLASS = 'ddc_ink_toolbar-compact';

/** Switch to compact when clusters would collide within this clearance (px). */
const ENTER_GAP_PX = 4;
/** Leave compact only when wide layout keeps this much clearance (px) — avoids flicker while resizing. */
const EXIT_GAP_PX = 12;

export interface UseDrawingEmbedToolbarCompactOptions {
	enabled: boolean;
	isSaveCameraEnabled: boolean;
	showFingerDrawingToggle: boolean;
}

function readToolbarClusterRects(menuBarEl: Element) {
	const leftEl = menuBarEl.querySelector('.ink_quick-menu');
	const centerEl = menuBarEl.querySelector('.ink_tool-menu');
	const rightEl = menuBarEl.querySelector('.ink_extended-writing-menu');

	const centerRect = centerEl?.getBoundingClientRect();
	if (!centerRect || !isVisibleToolbarClusterRect(centerRect)) return null;

	const leftRect = leftEl?.getBoundingClientRect();
	const rightRect = rightEl?.getBoundingClientRect();

	return {
		left: leftRect && isVisibleToolbarClusterRect(leftRect) ? leftRect : null,
		center: centerRect,
		right: rightRect && isVisibleToolbarClusterRect(rightRect) ? rightRect : null,
	};
}

/** Toggles compact toolbar layout when wide-mode cluster bounding boxes overlap. */
export function useDrawingEmbedToolbarCompact(
	editorWrapperRef: React.RefObject<HTMLDivElement | null>,
	options: UseDrawingEmbedToolbarCompactOptions,
): void {
	const isCompactRef = React.useRef(false);

	React.useLayoutEffect(() => {
		if (!options.enabled) return;

		const editorEl = editorWrapperRef.current;
		if (!editorEl) return;

		const measure = () => {
			const menuBarEl = editorEl.querySelector('.ink_primary-menu-bar');
			if (!menuBarEl) return;

			const wasCompact = isCompactRef.current;
			// Probe wide layout before measuring — compact CSS changes cluster positions.
			if (wasCompact) {
				editorEl.classList.remove(DRAWING_EMBED_TOOLBAR_COMPACT_CLASS);
			}

			const clusters = readToolbarClusterRects(menuBarEl);
			if (!clusters) {
				if (wasCompact) {
					editorEl.classList.add(DRAWING_EMBED_TOOLBAR_COMPACT_CLASS);
				}
				return;
			}

			const gapPx = wasCompact ? EXIT_GAP_PX : ENTER_GAP_PX;
			const shouldCompact = drawingToolbarClustersOverlap(clusters, gapPx);

			isCompactRef.current = shouldCompact;
			if (shouldCompact) {
				editorEl.classList.add(DRAWING_EMBED_TOOLBAR_COMPACT_CLASS);
			} else {
				editorEl.classList.remove(DRAWING_EMBED_TOOLBAR_COMPACT_CLASS);
			}
		};

		measure();

		const resizeObserver = new ResizeObserver(() => measure());
		resizeObserver.observe(editorEl);

		return () => {
			resizeObserver.disconnect();
			isCompactRef.current = false;
			editorEl.classList.remove(DRAWING_EMBED_TOOLBAR_COMPACT_CLASS);
		};
	}, [
		editorWrapperRef,
		options.enabled,
		options.isSaveCameraEnabled,
		options.showFingerDrawingToggle,
	]);
}
