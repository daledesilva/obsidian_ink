# Undo/Redo for Ink Embeds

This document describes the conceptual approach for undo and redo when ink embeds (writing or drawing) are in edit mode, and the alternatives that were considered.

---

## Chosen approach: Unified custom stack

When an ink embed is **unlocked** (edit mode), the embed captures Mod+Z and Mod+Shift+Z and maintains its own unified undo/redo history that interleaves tldraw (canvas) actions and Obsidian (markdown) actions.

### When active

- The embed captures Mod+Z and Mod+Shift+Z **only when unlocked** (edit mode)
- When no embed is in edit mode, the event propagates and Obsidian handles it as usual

### Two stacks

- **Undo stack**: Ordered list of actions to undo (most recent at top)
- **Redo stack**: Ordered list of actions to redo
- On undo: pop from undo stack, execute the inverse, push to redo stack
- On redo: pop from redo stack, execute, push to undo stack

### Stack entries

Each entry is either:

- `"embed"` with an embed/editor id (a tldraw canvas action: stroke drawn, shape erased, etc.)
- `"obsidian"` (a CodeMirror action: text typed, embed inserted, etc.)

### How we add to the undo stack

We add entries **only when the tldraw store fires** (i.e. when the user does something in the canvas). There is no separate listener for Obsidian changes.

In `editor.store.listen` (tldraw store), when a user change is detected (excluding pointer moves):

1. **Check Obsidian**: Get the active MarkdownView editor and call CodeMirror's `undoDepth(editor.cm.state)`. Compare to `prevObsidianDepth`. If it increased, those Obsidian actions necessarily happened *before* the tldraw change that triggered this callback.
2. **Add Obsidian entries**: Add that many `"obsidian"` entries to the custom undo stack
3. **Check tldraw**: Get tldraw's `getNumUndos()` and compare to `prevTldrawUndos`. If it increased, add that many `"embed"` entries with the current embed/editor id
4. **Update baseline**: Set `prevObsidianDepth` and `prevTldrawUndos` to current values; clear the redo stack

**Order**: Obsidian entries are pushed first (older), then embed entries (newer). Both go to the top in that order.

### On Mod+Z

- **First**: Sync — check Obsidian undo depth and tldraw undos; add any Obsidian (or tldraw) entries that accrued since the last store.listen. This ensures we capture Obsidian typing that happened without a canvas action.
- Then: Pop from the custom undo stack
- If `"embed"`: call undo on the recorded tldraw editor
- If `"obsidian"`: call `editor.undo()` on the active MarkdownView (with a guard so we do not treat our own programmatic undo as a new action)
- Push the popped entry onto the redo stack

### On Mod+Shift+Z

- Pop from the custom redo stack
- If `"embed"`: call redo on the recorded tldraw editor
- If `"obsidian"`: call `editor.redo()` on the active MarkdownView
- Push the popped entry onto the undo stack

### When undo stack is empty and user presses Mod+Z

Do not lock the embed. Instead, show an Obsidian notification:

> To undo further in Obsidian you must lock the Ink embed (which will discard any redo ability in the embed).

Locking when empty would cause the user to lose tldraw redo history; the notification explains the trade-off.

### Initial state

When entering edit mode, capture `prevObsidianDepth` and `prevTldrawUndos` from the current editors. We only track *increases* from that point, so existing history is not re-recorded.

### Multiple embeds

Each `"embed"` entry stores which embed/editor it belongs to. When popping an `"embed"` entry, we undo the correct tldraw instance from the registry.

---

## Approaches considered and pitfalls

### Focus-based routing

Route Mod+Z to tldraw or Obsidian based on `document.activeElement` (whether focus is in the canvas or in CodeMirror).

**Pitfall**: Focus can drift (e.g. mouse outside the embed, accidental blur). The user might intend to undo a stroke but accidentally undo the embed insertion in Obsidian, causing the whole embed to disappear.

### Edit-mode override (always tldraw when unlocked)

When the embed is in edit mode, always route Mod+Z to tldraw regardless of focus.

**Pitfall**: The user cannot undo text they typed in the surrounding markdown while the embed is open. If they add a caption and press Mod+Z, they expect to undo the caption, not a stroke.

### Unified Obsidian history

Register tldraw changes into CodeMirror's undo stack so a single Mod+Z would undo both text and canvas in chronological order.

**Pitfall**: CodeMirror's undo is document-centric; each step reverts a change to the markdown document. Drawing data lives in separate SVG files, not in the document. This is not structurally feasible without inlining all ink data into the markdown.

### Peek and prevent

Inspect CodeMirror's undo stack to detect when the next undo would remove the embed, then block or warn.

**Pitfall**: CodeMirror does not expose a "peek next undo" API. The history package tracks depth and state but does not describe what the next undo would revert.

### Separate shortcuts

Use different shortcuts for ink vs markdown (e.g. Mod+Alt+Z for ink).

**Pitfall**: Non-standard UX. Users expect Mod+Z everywhere and do not want to remember context-specific shortcuts.
