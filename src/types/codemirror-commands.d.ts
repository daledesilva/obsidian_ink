/**
 * Type declarations for @codemirror/commands.
 * The actual module is provided by Obsidian at runtime (external in esbuild).
 */

declare module '@codemirror/commands' {
  export function undoDepth(state: unknown): number;
  export function redoDepth(state: unknown): number;
}
