import { describe, expect, jest, test } from '@jest/globals';
import {
  containCanvasEvent,
  executeDrawingKeyboardShortcut,
  focusDrawingEventBoundary,
  type DrawingKeyboardEditor,
  type DrawingKeyboardEvent,
} from './drawing-keyboard-shortcuts';

function createEvent(overrides: Partial<DrawingKeyboardEvent> = {}): DrawingKeyboardEvent {
  return {
    code: '',
    ctrlKey: false,
    key: '',
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

function createEditor(overrides: Partial<DrawingKeyboardEditor> = {}) {
  return {
    deleteShapes: jest.fn(),
    getCurrentToolId: jest.fn(() => 'select'),
    getEditingShapeId: jest.fn(() => null),
    getSelectedShapeIds: jest.fn(() => ['shape:one']),
    redo: jest.fn(),
    undo: jest.fn(),
    ...overrides,
  } as DrawingKeyboardEditor;
}

describe('executeDrawingKeyboardShortcut', () => {
  test('uses Ctrl+Z for undo on non-Mac platforms', () => {
    const editor = createEditor();

    const handled = executeDrawingKeyboardShortcut(
      createEvent({ ctrlKey: true, key: 'z' }),
      editor,
      false,
    );

    expect(handled).toBe(true);
    expect(editor.undo).toHaveBeenCalledTimes(1);
    expect(editor.redo).not.toHaveBeenCalled();
  });

  test('uses Cmd+Z for undo on Mac platforms', () => {
    const editor = createEditor();

    const handled = executeDrawingKeyboardShortcut(
      createEvent({ key: 'Z', metaKey: true }),
      editor,
      true,
    );

    expect(handled).toBe(true);
    expect(editor.undo).toHaveBeenCalledTimes(1);
  });

  test.each([
    createEvent({ ctrlKey: true, key: 'z', shiftKey: true }),
    createEvent({ ctrlKey: true, key: 'y' }),
  ])('supports the non-Mac redo shortcuts', (event) => {
    const editor = createEditor();

    const handled = executeDrawingKeyboardShortcut(event, editor, false);

    expect(handled).toBe(true);
    expect(editor.redo).toHaveBeenCalledTimes(1);
    expect(editor.undo).not.toHaveBeenCalled();
  });

  test('deletes selected shapes only while the select tool is not editing text', () => {
    const editor = createEditor();

    const handled = executeDrawingKeyboardShortcut(
      createEvent({ key: 'Backspace' }),
      editor,
      false,
    );

    expect(handled).toBe(true);
    expect(editor.deleteShapes).toHaveBeenCalledWith(['shape:one']);
  });

  test('leaves Backspace alone while editing text', () => {
    const editor = createEditor({
      getEditingShapeId: jest.fn(() => 'shape:text'),
    });

    const handled = executeDrawingKeyboardShortcut(
      createEvent({ key: 'Backspace' }),
      editor,
      false,
    );

    expect(handled).toBe(false);
    expect(editor.deleteShapes).not.toHaveBeenCalled();
  });

  test('leaves Ctrl+C for the inner canvas while the boundary contains it', () => {
    const editor = createEditor();
    const event = createEvent({ ctrlKey: true, key: 'c' });
    const stopPropagation = jest.fn();

    const handled = executeDrawingKeyboardShortcut(event, editor, false);
    containCanvasEvent({ stopPropagation });

    expect(handled).toBe(false);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(editor.undo).not.toHaveBeenCalled();
    expect(editor.redo).not.toHaveBeenCalled();
    expect(editor.deleteShapes).not.toHaveBeenCalled();
  });
});

describe('focusDrawingEventBoundary', () => {
  test('focuses the tldraw editor before its pointer handler can stop bubbling', () => {
    const editor = { focus: jest.fn() };
    const boundary = { focus: jest.fn() };

    focusDrawingEventBoundary(editor, boundary);

    expect(editor.focus).toHaveBeenCalledTimes(1);
    expect(boundary.focus).not.toHaveBeenCalled();
  });

  test('focuses the wrapper without scrolling while the editor is mounting', () => {
    const boundary = { focus: jest.fn() };

    focusDrawingEventBoundary(undefined, boundary);

    expect(boundary.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
});
