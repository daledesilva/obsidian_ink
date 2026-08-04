export type InkEmbedViewMode = 'source' | 'preview' | null;

export function getInkEmbedViewMode(
  parentClassName: string | undefined,
): InkEmbedViewMode {
  if (!parentClassName) return null;
  return parentClassName.includes('cm-preview-code-block') ? 'source' : 'preview';
}
