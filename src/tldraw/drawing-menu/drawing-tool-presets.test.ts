import { describe, expect, jest, test } from '@jest/globals';

jest.mock('@tldraw/tldraw', () => ({
  DefaultColorStyle: { id: 'tldraw:color' },
  DefaultSizeStyle: { id: 'tldraw:size' },
}));

import { DefaultColorStyle, DefaultSizeStyle } from '@tldraw/tldraw';
import {
  DRAWING_COLOR_PRESETS,
  DRAWING_SIZE_PRESETS,
  applyDrawingPreset,
  type DrawingPresetEditor,
} from './drawing-tool-presets';

function createEditor() {
  return {
    setCurrentTool: jest.fn(),
    setStyleForNextShapes: jest.fn(),
  } as unknown as DrawingPresetEditor;
}

describe('drawing tool presets', () => {
  test('offers the agreed simple colors and three practical pen sizes', () => {
    expect(DRAWING_COLOR_PRESETS.map(({ value }) => value)).toEqual([
      'black',
      'red',
      'blue',
      'green',
    ]);
    expect(DRAWING_SIZE_PRESETS.map(({ value }) => value)).toEqual(['s', 'm', 'l']);
  });

  test.each(['draw', 'highlight'] as const)(
    'applies color and size before activating the %s tool',
    (tool) => {
      const editor = createEditor();

      applyDrawingPreset(editor, {
        color: 'red',
        size: 'l',
        tool,
      });

      expect(editor.setStyleForNextShapes).toHaveBeenNthCalledWith(
        1,
        DefaultColorStyle,
        'red',
      );
      expect(editor.setStyleForNextShapes).toHaveBeenNthCalledWith(
        2,
        DefaultSizeStyle,
        'l',
      );
      expect(editor.setCurrentTool).toHaveBeenCalledWith(tool);
    },
  );
});
