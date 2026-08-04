import type { TLShapeId } from '@tldraw/tldraw';

export interface DrawingKeyboardEvent {
  code: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface DrawingKeyboardEditor {
  deleteShapes(ids: TLShapeId[]): unknown;
  getCurrentToolId?(): string;
  getEditingShapeId?(): unknown;
  getSelectedShapeIds(): TLShapeId[];
  redo(): unknown;
  undo(): unknown;
}

export interface DrawingFocusEditor {
  focus(): unknown;
}

export interface DrawingEventBoundary {
  focus(options: { preventScroll: boolean }): unknown;
}

export function executeDrawingKeyboardShortcut(
  event: DrawingKeyboardEvent,
  editor: DrawingKeyboardEditor,
  isMac: boolean,
): boolean {
  const modifierKey = isMac ? event.metaKey : event.ctrlKey;
  const key = event.key.toLowerCase();

  if (modifierKey && !event.shiftKey && key === 'z') {
    editor.undo();
    return true;
  }

  if (modifierKey && ((event.shiftKey && key === 'z') || key === 'y')) {
    editor.redo();
    return true;
  }

  if (!modifierKey && (key === 'backspace' || key === 'delete')) {
    const isSelectTool = editor.getCurrentToolId?.() === 'select';
    const isEditingText = Boolean(editor.getEditingShapeId?.());

    if (isSelectTool && !isEditingText) {
      const selectedShapeIds = editor.getSelectedShapeIds();
      if (selectedShapeIds.length > 0) {
        editor.deleteShapes(selectedShapeIds);
        return true;
      }
    }
  }

  return false;
}

export function containCanvasEvent(event: { stopPropagation(): void }): void {
  event.stopPropagation();
}

export function focusDrawingEventBoundary(
  editor: DrawingFocusEditor | undefined,
  boundary: DrawingEventBoundary | null,
): void {
  if (editor) {
    editor.focus();
    return;
  }

  boundary?.focus({ preventScroll: true });
}
