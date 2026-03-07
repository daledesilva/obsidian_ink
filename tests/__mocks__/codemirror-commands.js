/**
 * Mock for @codemirror/commands used by obsidian-undo-depth.ts.
 * Returns 0 for undo/redo depth since we never have a real CodeMirror state in tests.
 */

export function undoDepth() {
  return 0;
}

export function redoDepth() {
  return 0;
}
