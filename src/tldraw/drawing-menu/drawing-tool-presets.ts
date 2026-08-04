import {
  DefaultColorStyle,
  DefaultSizeStyle,
  type Editor,
  type TLDefaultColorStyle,
  type TLDefaultSizeStyle,
} from '@tldraw/tldraw';

export type DrawingMarkTool = 'draw' | 'highlight';
export type DrawingPresetColor = Extract<
  TLDefaultColorStyle,
  'black' | 'red' | 'blue' | 'green'
>;
export type DrawingPresetSize = Extract<TLDefaultSizeStyle, 's' | 'm' | 'l'>;

export type DrawingPresetEditor = Pick<Editor, 'setCurrentTool' | 'setStyleForNextShapes'>;

export const DRAWING_COLOR_PRESETS: ReadonlyArray<{
  label: string;
  value: DrawingPresetColor;
}> = [
  { label: 'Black', value: 'black' },
  { label: 'Red', value: 'red' },
  { label: 'Blue', value: 'blue' },
  { label: 'Green', value: 'green' },
];

export const DRAWING_SIZE_PRESETS: ReadonlyArray<{
  label: string;
  value: DrawingPresetSize;
}> = [
  { label: 'Small', value: 's' },
  { label: 'Medium', value: 'm' },
  { label: 'Large', value: 'l' },
];

export function applyDrawingPreset(
  editor: DrawingPresetEditor,
  preset: {
    color: DrawingPresetColor;
    size: DrawingPresetSize;
    tool: DrawingMarkTool;
  },
) {
  editor.setStyleForNextShapes(DefaultColorStyle, preset.color);
  editor.setStyleForNextShapes(DefaultSizeStyle, preset.size);
  editor.setCurrentTool(preset.tool);
}
