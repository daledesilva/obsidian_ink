# Plan: Consolidate Ink Options into Per-Embed Overflow Menus

## Status
Planned

## Summary
Move ink-specific file actions (currently in Obsidian's native "more options" pane menu) into the embedded overflow menu visible on the ink embed/view itself. Apply this consistently to both drawings and writings.

---

## Context

### Current state
- The **Drawing full-page view** (`drawing-view.tsx`) registers a `onPaneMenu` entry called **"Convert to Writing"**. This appears in Obsidian's native three-dot/more-options menu (the pane header menu).
- The **Writing full-page view** (`writing-view.tsx`) similarly registers **"Convert to Drawing"** in the same Obsidian pane menu.
- Both views already render an **`ExtendedDrawingMenu`** / **`ExtendedWritingMenu`** which contains a lock button and an `OverflowMenu`. The Drawing overflow menu already has **"Copy embed"** and **"Grid on/off"** items.
- The Writing view currently passes no `menuOptions` to its overflow, meaning its overflow button exists in the component but does nothing visible.

### Why consolidate
Having ink-only options buried in Obsidian's generic pane menu (alongside unrelated system items like "Open in default app", "Pin tab") makes them hard to discover. The in-canvas overflow menu is the natural, always-visible home for all ink-specific actions — keeping them grouped, predictable, and consistent between drawing and writing.

---

## Changes Required

### 1. Drawing full-page view (`drawing-view.tsx`)
- **Remove** the `onPaneMenu` override (which adds "Convert to Writing" to Obsidian's menu).
- **Add** a `{ text: 'Convert to Writing', action: ... }` entry to the `getExtendedOptions` function that already builds the drawing overflow menu options.
- The action body is already written in `onPaneMenu` — just move it:
  ```ts
  {
    text: 'Convert to Writing',
    action: () => {
      if (!fileRef) return;
      new FileConversionModal(plugin, fileRef, 'inkWriting', {
        onConversionComplete: () => openInkFile(fileRef),
      }).open();
    }
  }
  ```
- Verify `FileConversionModal` and `openInkFile` are already imported (they are).

### 2. Writing full-page view (`writing-view.tsx`)
- **Remove** the `onPaneMenu` override (which adds "Convert to Drawing" to Obsidian's menu).
- The `TldrawWritingEditor` component call in `setViewData` currently does **not** pass an `extendedMenu` / menu options prop. Check whether `TldrawWritingEditor` already accepts such a prop (follow the same pattern as `TldrawDrawingEditor` which accepts `extendedMenu`). If not, wire up the prop in the same way.
- Pass menu options including **"Convert to Drawing"**:
  ```ts
  extendedMenu={[
    {
      text: 'Convert to Drawing',
      action: () => {
        if (!this.file) return;
        new FileConversionModal(this.plugin, this.file, 'inkDrawing', {
          onConversionComplete: () => openInkFile(this.file!),
        }).open();
      }
    }
  ]}
  ```
- Verify `FileConversionModal` and `openInkFile` are already imported in this file (they are).

### 3. Writing embed (`writing-embed.tsx` / `extended-writing-menu`)
- Ensure `ExtendedWritingMenu` is always rendered (not conditionally hidden) when on the full-page view — matching the drawing side's behaviour. Confirm `menuOptions` is surfaced to the component even if empty.
- If `ExtendedWritingMenu` is currently hidden because `menuOptions` length is 0 or because the prop is not threaded through, fix that so the overflow button is always visible on writing full-page views.

### 4. Documentation note
Add a short note to `docs/` (e.g. `pen-vs-finger-handling.md` or a new `ux-decisions.md`) explaining this decision:

> **Ink options live in the ink overflow menu, not the Obsidian pane menu.**
> All actions specific to an ink file (conversion, grid toggle, copy embed, etc.) are surfaced in the overflow (⋯) button inside the ink canvas / view, rather than in Obsidian's generic "more options" pane header menu. This keeps ink-related options grouped, discoverable, and consistent whether the file is open as a full-page view or viewed as an embed.

---

## Files to Change
- `src/components/formats/current/drawing/drawing-view/drawing-view.tsx`
- `src/components/formats/current/writing/writing-view/writing-view.tsx`
- `src/components/formats/current/writing/tldraw-writing-editor/tldraw-writing-editor.tsx` *(if menu options prop needs adding)*
- `src/components/formats/current/writing/writing-embed/writing-embed.tsx` *(if ExtendedWritingMenu visibility needs fixing)*
- `docs/ux-decisions.md` *(new documentation file — or append to an existing doc)*

## Related Components (reference only — no change needed)
- `src/components/jsx-components/overflow-menu/overflow-menu.tsx`
- `src/components/jsx-components/extended-drawing-menu/extended-drawing-menu.tsx`
- `src/components/jsx-components/extended-writing-menu/extended-writing-menu.tsx`

---

## Testing
- Open a `.inkDrawing.svg` file — confirm the overflow (⋯) button shows "Copy embed", "Grid on/off", and **"Convert to Writing"**. Confirm Obsidian's "more options" menu no longer shows "Convert to Writing".
- Open a `.inkWriting.svg` file — confirm the overflow (⋯) button shows **"Convert to Drawing"**. Confirm Obsidian's "more options" menu no longer shows "Convert to Drawing".
- Trigger "Convert to Writing" from the drawing overflow — confirm the `FileConversionModal` opens correctly and conversion succeeds.
- Trigger "Convert to Drawing" from the writing overflow — same check.
