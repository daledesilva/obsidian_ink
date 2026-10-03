/** Matches ink embed preview / Boox e-ink editor chrome (`ink-boox-eink-chrome.scss`). */
export const INK_BOOX_EMBED_CORNER_RADIUS_CSS_PX = 20;

/** Largest computed corner radius on the ink editor wrapper, in CSS px. */
export function getBooxEmbedCornerRadiusCssPx(wrapper: HTMLElement): number {
	const editor = wrapper.querySelector('.ddc_ink_drawing-editor, .ddc_ink_writing-editor');
	const target = editor instanceof HTMLElement ? editor : wrapper;
	const style = window.getComputedStyle(target);
	const cornerRadiusCssValues = [
		style.borderTopLeftRadius,
		style.borderTopRightRadius,
		style.borderBottomLeftRadius,
		style.borderBottomRightRadius,
	];
	let maxCornerRadiusCssPx = 0;
	for (const cornerRadiusCssValue of cornerRadiusCssValues) {
		const parsedCornerRadiusCssPx = Number.parseFloat(cornerRadiusCssValue);
		if (Number.isFinite(parsedCornerRadiusCssPx)) {
			maxCornerRadiusCssPx = Math.max(maxCornerRadiusCssPx, parsedCornerRadiusCssPx);
		}
	}
	if (maxCornerRadiusCssPx > 0) return Math.round(maxCornerRadiusCssPx);
	return INK_BOOX_EMBED_CORNER_RADIUS_CSS_PX;
}
