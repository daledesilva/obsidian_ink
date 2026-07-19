# Undo/Redo

Unified stack + keyboard routing. Details only where non-obvious.

---

## Permutations (read this)

**Scope:** Unified stack, embed registry “active” pointer, Obsidian depth baseline, and dedicated editor registration are all keyed by **`WorkspaceLeaf.id`**. Split panes (same file in two leaves, or mixed markdown + dedicated) keep **independent** histories.

- **Keyboard routing:** `handleKeydown` reads `workspace.activeLeaf?.id`. If there is no `leafId`, ink does **not** intercept Mod+Z — Obsidian keeps default behaviour.
- **Embed → leaf:** Live Preview widgets resolve the owning leaf via `workspace-leaf-from-cm.ts` (`MarkdownView.editor.cm ===` embed’s `EditorView`). If that returns null, the embed gets an empty `workspaceLeafId` and **does not** register unified undo (no fallback to a global stack).

**Dedicated ink tab** (`ink_writing-view` / `ink_drawing-view`)

- Active leaf is that view.
- `registerDedicatedInkEditor(leafId, …)` holds the tldraw instance **for that leaf**.
- **Mod+Z / Mod+Shift+Z / Mod+Y** → capture-phase `keydown` in `keyboard-handler.ts` → `editor.undo()` / `editor.redo()`. No unified stack.
- Why: focus usually lands on `document.body`; wrapper never sees keydown. Document capture fixes it.
- Wrapper `onKeyDownCapture` still exists as a backup if focus ever sits on the wrapper.

**Markdown + embed unlocked**

- That embed’s editor is in `ink-editor-registry` with `workspaceLeafId`; `getActiveEmbedIdForLeaf(leafId)` is set (last mousedown on an embed **in that leaf**).
- **Mod+Z / Mod+Shift+Z** → same handler → **unified stack for `activeLeaf.id`**: sync, pop, run that leaf’s `MarkdownView.editor.undo/redo` *or* `registry` tldraw *or* resize applier.
- **Not** dedicated leaf → embed path can run; **if** active leaf **is** dedicated, embed branch is **skipped** so markdown embeds in other leaves don’t steal shortcuts.

**Markdown + embed locked**

- Not in registry. `getActiveEmbedIdForLeaf(leafId)` null for that leaf.
- **Mod+Z / Mod+Shift+Z** fall through → normal Obsidian / CodeMirror undo.
- Unified **commands** still dispatch synthetic key: if nothing intercepts, they call `MarkdownView.editor.undo/redo()` directly (mobile / no CM focus).

**Several embeds unlocked (same leaf)**

- One “active” embed id **per leaf** (last clicked in that leaf). Keyboard unified undo/redo uses **that** id for sync + pops for `activeLeaf.id`; stack entries carry per-embed ids so execution hits the right editor.
- Merge when a **second** embed unlocks in the **same** leaf uses `getRegisteredEmbedCountForLeaf(leafId)`.

**Split panes / mixed leaves**

- Two markdown leaves → two stacks, two baselines, two active-embed pointers.
- Dedicated leaf + markdown leaf → dedicated shortcuts affect only the dedicated leaf’s editor; markdown leaf uses its own stack when an embed there is active.

**Plugin commands “Unified undo/redo”**

- Synthetic `keydown` on `document`.
- If handler calls `preventDefault` → handled (dedicated **or** embed unified).
- Else → `getActiveViewOfType(MarkdownView)?.editor.undo/redo()`.

**Resize drawing embed**

- `embed-resize` entries on stack; pointer-up pushes directly.

**Lock embed**

- Unregister → `purgeEmbedEntriesFromStacks(leafId, embedId)`, `clearEmbedBaseline(leafId, embedId)`. Dead steps gone from stack.
- Lock transaction uses `addToHistory: false` for dimension write so undo doesn’t resize the locked box.

---

## Sync (embed only)

- **When:** stroke complete / erased (`store.listen` → `syncUnifiedUndoHistory(leafId, embedId, { maxTldrawDelta: 1 })`) **before** save queue; **again** on **Mod+Z / Mod+Shift+Z** before pop (embed path).
- **Why cap delta:** tldraw bumps undo count twice per stroke; cap ⇒ one stack entry per stroke.
- **Guards:** programmatic undo/redo from **embed** menus sets flags so sync doesn’t duplicate or nuke redo (`unified-undo-stack`).

---

## Files

| File | Role |
|------|------|
| `unified-undo-stack.ts` | Per-`leafId` stacks, sync, guards, merge on 2nd unlock in leaf |
| `ink-editor-registry.ts` | embedId → Editor + `workspaceLeafId`, `getActiveEmbedIdForLeaf`, `getRegisteredEmbedCountForLeaf` |
| `dedicated-ink-editor-registry.ts` | `Map<leafId, Editor>` for dedicated tabs |
| `workspace-leaf-from-cm.ts` | Resolve `WorkspaceLeaf` from `EditorView` (embed widgets) |
| `keyboard-handler.ts` | `registerDomEvent(…, keydown, { capture: true })`: **dedicated first**, then embed unified |
| `unified-commands.ts` | Synthetic key + Markdown fallback |
| `obsidian-undo-depth.ts` | CM undo depth for a leaf (`getObsidianUndoDepthForLeaf`, `getMarkdownViewForLeaf`) |
| `src/types/obsidian-workspace-leaf.d.ts` | Augments `WorkspaceLeaf` with `id` (runtime API; typings may omit it) |

Wire: `main.ts` → `registerUnifiedUndoRedo` (+ commands) when writing/drawing on. Editors register/unregister on mount/unmount.

---

## API (skim)

- Stack: all mutators take `leafId` first (or as first parameter where natural): `initialize`, `syncUnifiedUndoHistory`, pops/pushes, `purgeEmbedEntriesFromStacks`, `pushDrawingEmbedResize`, `popEmbedUndoAndPushToRedo`, `popEmbedRedoAndPushToUndo`, programmatic flags.
- Registry: `register` / `unregister` / `getEditor` / `setActiveEmbedForLeaf` / `getActiveEmbedIdForLeaf` / `getRegisteredEmbedCountForLeaf`.

---

## Gotchas

- `getNumUndos`: `(editor as any).history?.getNumUndos?.()` — private API.
- Dedicated: **no** `Mod+Y` on embed unified path; **yes** on dedicated path (matches editor shortcuts).
- Tests / mobile: synthetic key may not focus CM; command fallback exists for that.
- Programmatic flags (`__inkProgrammaticRedoInProgress`, etc.) live on the **plugin** instance, not per `leafId` — fine if only one programmatic op runs at a time.

---

## Tests

- Unit: `unified-undo-stack`, `keyboard-handler`, `unified-commands`.
- E2E: `undo-redo.e2e.ts` (vault notes in qa area); some cases skipped + documented in test file.
