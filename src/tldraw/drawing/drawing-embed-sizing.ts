import { DRAWING_INITIAL_WIDTH } from 'src/constants';

export function isFluidDrawingEmbedWidth(savedWidth: number | undefined): boolean {
  return savedWidth === undefined || savedWidth <= 0 || savedWidth === DRAWING_INITIAL_WIDTH;
}

export function resolveDrawingEmbedWidth(
  savedWidth: number | undefined,
  availableWidth: number,
): number {
  if (savedWidth === undefined) return availableWidth;
  if (isFluidDrawingEmbedWidth(savedWidth)) return availableWidth;
  return Math.min(savedWidth, availableWidth);
}
