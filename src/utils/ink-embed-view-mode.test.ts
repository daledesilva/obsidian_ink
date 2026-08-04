import { describe, expect, test } from '@jest/globals';
import { getInkEmbedViewMode } from './ink-embed-view-mode';

describe('getInkEmbedViewMode', () => {
  test('allows editing inside the source/live-preview code block context', () => {
    expect(
      getInkEmbedViewMode('cm-preview-code-block cm-embed-block markdown-rendered'),
    ).toBe('source');
  });

  test('reports Reading mode as preview-only', () => {
    expect(getInkEmbedViewMode('el-pre mod-ui')).toBe('preview');
  });

  test('does not guess when the processor element has no parent', () => {
    expect(getInkEmbedViewMode(undefined)).toBeNull();
  });
});
