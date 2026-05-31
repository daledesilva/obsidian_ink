/**
 * DOM hit-testing for committed ink strokes on the SVG canvas.
 * Uses rendered geometry so camera transforms and offsets stay correct.
 */

export function getStrokeIdAtClientPoint(
	svg: SVGSVGElement,
	clientX: number,
	clientY: number,
): string | null {
	const document = svg.ownerDocument;
	if (!document) return null;

	const elementsAtPoint = document.elementsFromPoint?.(clientX, clientY) ?? [];
	for (const element of elementsAtPoint) {
		if (!(element instanceof Element)) continue;
		const strokeElement = element.closest('[data-stroke-id]');
		if (!strokeElement || !svg.contains(strokeElement)) continue;
		const strokeId = strokeElement.getAttribute('data-stroke-id');
		if (strokeId) return strokeId;
	}

	const fallback = document.elementFromPoint(clientX, clientY);
	if (!fallback) return null;
	const strokeElement = fallback.closest('[data-stroke-id]');
	if (!strokeElement || !svg.contains(strokeElement)) return null;
	return strokeElement.getAttribute('data-stroke-id');
}
