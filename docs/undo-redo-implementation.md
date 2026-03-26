# Undo/Redo

Unified stack + keyboard routing. Details only where non-obvious.

---

## Permutations (read this)

**Dedicated ink tab** (`ink_writing-view` / `ink_drawing-view`)

- Active leaf is that view.
- `registerDedicatedInkEditor` holds the tldraw instance.
- **Mod+Z / Mod+Shift+Z / Mod+Y** → capture-phase `keydown` in `keyboard-handler.ts` → `editor.undo()` / `editor.redo()`. No unified stack.
- Why: focus usually lands on `document.body`; wrapper never sees keydown. Document capture fixes it.
- Wrapper `onKeyDownCapture` still exists as a backup if focus ever sits on the wrapper.

**Markdown + embed unlocked**

- That embed’s editor is in `ink-editor-registry`; `getActiveEmbedId()` is set (last-focused embed).
- **Mod+Z / Mod+Shift+Z** → same handler → **unified stack**: sync, pop, run `MarkdownView.editor.undo/redo` *or* `registry` tldraw *or* resize applier.
- **Not** dedicated leaf → embed path can run even if another tab had an embed earlier; **if** active leaf **is** dedicated, embed branch is **skipped** so stale `getActiveEmbedId()` from another tab doesn’t steal shortcuts.

**Markdown + embed locked**

- Not in registry. `getActiveEmbedId()` null for that embed.
- **Mod+Z / Mod+Shift+Z** fall through → normal Obsidian / CodeMirror undo.
- Unified **commands** still dispatch synthetic key: if nothing intercepts, they call `MarkdownView.editor.undo/redo()` directly (mobile / no CM focus).

**Several embeds unlocked**

- One “active” embed id in registry (last clicked). Keyboard unified undo/redo uses **that** id for sync + pops; stack entries carry per-embed ids so execution hits the right editor.
- Local toolbar undo/redo on an embed adjusts stack for **that** `embedId` (programmatic guards on sync).

**Plugin commands “Unified undo/redo”**

- Synthetic `keydown` on `document`.
- If handler calls `preventDefault` → handled (dedicated **or** embed unified).
- Else → `getActiveViewOfType(MarkdownView)?.editor.undo/redo()`.

**Resize drawing embed**

- `embed-resize` entries on stack; pointer-up pushes directly.

**Lock embed**

- Unregister → `purgeEmbedEntriesFromStacks`, `clearEmbedBaseline`. Dead steps gone from stack.
- Lock transaction uses `addToHistory: false` for dimension write so undo doesn’t resize the locked box.

---

## Sync (embed only)

- **When:** stroke complete / erased (`store.listen` → `syncUnifiedUndoHistory(embedId, { maxTldrawDelta: 1 })`) **before** save queue; **again** on **Mod+Z / Mod+Shift+Z** before pop (embed path).
- **Why cap delta:** tldraw bumps undo count twice per stroke; cap ⇒ one stack entry per stroke.
- **Guards:** programmatic undo/redo from **embed** menus sets flags so sync doesn’t duplicate or nuke redo (`unified-undo-stack`).

---

## Files

| File | Role |
|------|------|
| `unified-undo-stack.ts` | Stack, sync, guards, merge on 2nd unlock |
| `ink-editor-registry.ts` | embedId → Editor, `getActiveEmbedId` |
| `dedicated-ink-editor-registry.ts` | dedicated tab’s single Editor |
| `keyboard-handler.ts` | `registerDomEvent(…, keydown, { capture: true })`: **dedicated first**, then embed unified |
| `unified-commands.ts` | Synthetic key + Markdown fallback |
| `obsidian-undo-depth.ts` | CM undo depth |

Wire: `main.ts` → `registerUnifiedUndoRedo` (+ commands) when writing/drawing on. Editors register/unregister on mount/unmount.

---

## API (skim)

- Stack: `initialize`, `syncUnifiedUndoHistory`, `popUndo` / `pushRedo` / `popRedo` / `pushUndo`, `purgeEmbedEntriesFromStacks`, `pushDrawingEmbedResize`, `popEmbedUndoAndPushToRedo`, `popEmbedRedoAndPushToUndo`, programmatic flags.
- Registry: `register` / `unregister` / `getEditor` / `getActiveEmbedId`.

---

## Gotchas

- `getNumUndos`: `(editor as any).history?.getNumUndos?.()` — private API.
- Dedicated: **no** `Mod+Y` on embed unified path; **yes** on dedicated path (matches editor shortcuts).
- Tests / mobile: synthetic key may not focus CM; command fallback exists for that.

---

## Tests

- Unit: `unified-undo-stack`, `keyboard-handler`, `unified-commands`.
- E2E: `undo-redo.e2e.ts` (vault notes in qa area); some cases skipped + documented in test file.
