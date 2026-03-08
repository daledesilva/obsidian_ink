# Undo/Redo Implementation

Technical documentation for the unified undo/redo stack used when ink embeds are in edit mode.

---

## Sync flows overview

The internal undo history is synced in two places:

**1. Switch branches (stroke completed/erased)** — When the user completes a stroke or erases, the store.listen switch hits `DrawingCompleted` or `DrawingErased`. We call `syncUnifiedUndoHistory` with `maxTldrawDelta: 1` just before `queueOrRunStorePostProcesses`. Programmatic undo/redo does not trigger these branches, so the redo stack is not cleared when the user redos.

**2. Keydown (Mod+Z / Mod+Shift+Z)** — Before popping and executing undo/redo, we call `syncUnifiedUndoHistory(activeEmbedId)` to capture any Obsidian edits since the last tldraw action.

```mermaid
flowchart TD
    subgraph storeListen [store.listen flow]
        A1[User changes canvas] --> A2[store.listen fires]
        A2 --> A3{DrawingCompleted or DrawingErased?}
        A3 -->|yes| A4["**SYNC: syncUnifiedUndoHistory**"]
        A3 -->|no| A5[Skip sync]
        A4 --> A6[queueOrRunStorePostProcesses]
    end

    subgraph keydown [Keydown flow]
        B1[Mod+Z or Mod+Shift+Z] --> B2{Embed in edit mode?}
        B2 -->|no| B3[Let propagate]
        B2 -->|yes| B4[preventDefault stopPropagation]
        B4 --> B5["**SYNC: syncUnifiedUndoHistory**"]
        B5 --> B7{Undo or Redo?}
        B7 -->|Undo| B8[popUndo, execute, pushRedo]
        B7 -->|Redo| B9[popRedo, execute, pushUndo]
    end
```

---

## Programmatic redo guard

When the user presses Mod+Shift+Z, we call `editor.redo()` on tldraw. That restores shapes and updates the store. tldraw's `store.listen` fires (with `source: 'user'`), the DrawingCompleted/DrawingErased branch runs, and `syncUnifiedUndoHistory` is called. Without a guard, sync would see `getNumUndos()` increased, add an embed entry, and clear the redo stack—wiping the user's ability to redo further.

We use a flag stored on the plugin instance (`plugin.__inkProgrammaticRedoInProgress`). Before `executeRedo`, we set it to `true`; when sync runs and sees it set, we skip adding entries and clearing the redo stack, but still update the baseline. We clear the flag after 50ms via `setTimeout` so any async `store.listen` callback that runs after `editor.redo()` returns still sees it. The keyboard handler passes the plugin explicitly so the flag is set on the same instance that sync reads via `getGlobals().plugin`.

### Redo flow with guard (sequence)

```mermaid
sequenceDiagram
    participant User
    participant Handler
    participant Stack
    participant Execute
    participant Store
    participant Sync

    User->>Handler: Mod+Shift+Z
    Handler->>Stack: syncUnifiedUndoHistory
    Handler->>Stack: popRedo
    Handler->>Handler: setProgrammaticRedoInProgress true
    Handler->>Execute: executeRedo editor.redo
    Execute->>Store: editor.redo
    Store->>Sync: store.listen fires
    Sync->>Sync: isProgrammaticRedoInProgress yes
    Sync->>Sync: Update baseline return skip add and clear
    Sync-->>Execute: return
    Execute-->>Handler: return
    Handler->>Handler: setTimeout clear flag 50ms
    Handler->>Stack: pushUndo
```

### Sync decision tree with guard

```mermaid
flowchart TD
    A[syncUnifiedUndoHistory called] --> B[getObsidianUndoDepth getTldrawNumUndos]
    B --> C{isProgrammaticRedoInProgress}
    C -->|yes| D[Update prevObsidianDepth and prevTldrawUndosByEmbed for this embedId]
    D --> E[Return early skip add and clear]
    C -->|no| F[Compute obsidianDelta tldrawDelta]
    F --> G[Add entries to undo stack]
    G --> H{added.length greater than 0}
    H -->|yes| I[Clear redo stack]
    H -->|no| J[Skip]
    I --> K[Update baseline]
    J --> K
```

---

## Files and modules

| File | Purpose |
|------|---------|
| `src/logic/undo-redo/unified-undo-stack.ts` | Custom undo/redo stack state and sync logic |
| `src/logic/undo-redo/ink-editor-registry.ts` | Map of embedId → tldraw Editor; register/unregister on mount |
| `src/logic/undo-redo/obsidian-undo-depth.ts` | Helper to get CodeMirror `undoDepth(state)` from active MarkdownView |
| `src/logic/undo-redo/keyboard-handler.ts` | Global keydown handler for Mod+Z and Mod+Shift+Z |

**Wiring points:**
- `TldrawWritingEditor.handleMount` / `TldrawDrawingEditor.handleMount` — register editor, store.listen calls sync just before `queueOrRunStorePostProcesses` in DrawingCompleted/DrawingErased branches
- `main.ts` — call `registerUnifiedUndoRedo(plugin)` on load when writing/drawing enabled

---

## Per-embed tldraw baseline

The sync logic tracks `prevTldrawUndosByEmbed: Map<embedId, number>` instead of a single global `prevTldrawUndos`. This fixes undo double-ups when multiple embeds are unlocked: each embed's delta is computed against its own baseline, so strokes in Embed B are no longer missed when the baseline was last updated by Embed A.

When an embed is unregistered (e.g. on lock), `clearEmbedBaseline(embedId)` removes its entry from the map to avoid unbounded growth.

### Sync baseline flow (per embed)

```mermaid
flowchart TD
    subgraph sync [syncUnifiedUndoHistory]
        A[embedId] --> B[getEditor embedId]
        B --> C[tldrawUndos = getTldrawNumUndos editor]
        C --> D[prev = prevTldrawUndosByEmbed.get embedId or 0]
        D --> E[tldrawDelta = tldrawUndos - prev]
        E --> F[Push tldrawDelta entries with embedId]
        F --> G[prevTldrawUndosByEmbed.set embedId, tldrawUndos]
    end
```

---

## Data flow

### Sync (when stroke completed or erased)

`syncUnifiedUndoHistory` runs just before `queueOrRunStorePostProcesses` in the `DrawingCompleted` and `DrawingErased` switch branches. We use `maxTldrawDelta: 1` so each stroke produces one embed entry. Programmatic `editor.undo()` / `editor.redo()` do not trigger these branches, so the redo stack is not cleared when the user redos.

```mermaid
flowchart TD
    subgraph SyncFlow [DrawingCompleted / DrawingErased switch branch]
        A[DrawingCompleted or DrawingErased] --> B[syncUnifiedUndoHistory with maxTldrawDelta 1]
        B --> C[getObsidianUndoDepth]
        C --> D{obsidianDepth increased?}
        D -->|yes| E[Add N obsidian entries to undo stack]
        D -->|no| F[Skip]
        E --> G[getTldrawNumUndos]
        F --> G
        G --> H{tldrawUndos increased vs this embed's baseline?}
        H -->|yes| I[Add M embed entries with embedId capped at 1]
        H -->|no| J[Skip]
        I --> K[Update prevObsidianDepth; update prevTldrawUndosByEmbed for this embedId]
        J --> K
        K --> L[Clear redo stack if entries added]
    end
```

### Keydown (Mod+Z / Mod+Shift+Z)

The handler syncs before undo and redo to capture any Obsidian changes that occurred without a tldraw store event (e.g. user typed in markdown while the embed was in edit mode).

```mermaid
flowchart TD
    subgraph KeydownFlow [keydown handler]
        A[Mod+Z or Mod+Shift+Z] --> B{Embed in edit mode?}
        B -->|no| C[Let event propagate]
        B -->|yes| D[preventDefault stopPropagation]
        D --> E[syncUnifiedUndoHistory]
        E --> F{Mod+Z or Mod+Shift+Z?}
        F -->|Mod+Z| G{Undo stack empty?}
        G -->|yes| H[Show notification]
        G -->|no| I[Pop from undo stack]
        I --> J{Entry type?}
        J -->|embed| K[editor.undo on registry lookup]
        J -->|obsidian| L[MarkdownView.editor.undo]
        K --> M[Push to redo stack]
        L --> M
        F -->|Mod+Shift+Z| N{Redo stack empty?}
        N -->|yes| O[Do nothing]
        N -->|no| P[Pop from redo stack]
        P --> Q{Entry type?}
        Q -->|embed| R[editor.redo on registry]
        Q -->|obsidian| S[MarkdownView.editor.redo]
        R --> T[Push to undo stack]
        S --> T
    end
```

---

## API surface

### unified-undo-stack.ts

```typescript
type UnifiedUndoEntry =
  | { type: 'embed'; embedId: string }
  | { type: 'obsidian' };

function initialize(obsidianDepth: number, _tldrawUndos?: number, seedTldrawByEmbed?: Record<string, number>): void;
function syncUnifiedUndoHistory(embedId: string, options?: { maxTldrawDelta?: number }): void;
// Fetches plugin from getGlobals(), editor from getEditor(embedId); returns early if no editor.
function popUndo(): UnifiedUndoEntry | null;
function pushRedo(entry: UnifiedUndoEntry): void;
function popRedo(): UnifiedUndoEntry | null;
function pushUndo(entry: UnifiedUndoEntry): void;
function isUndoStackEmpty(): boolean;
function clearEmbedBaseline(embedId: string): void;  // called by unregister
```

### ink-editor-registry.ts

```typescript
function register(embedId: string, editor: Editor, containerEl: HTMLElement): void;
function unregister(embedId: string): void;  // also calls clearEmbedBaseline
function getEditor(embedId: string): Editor | undefined;
function getActiveEmbedId(): string | null;  // from embed state atoms
```

### obsidian-undo-depth.ts

```typescript
function getObsidianUndoDepth(plugin: InkPlugin): number;
function getObsidianRedoDepth(plugin: InkPlugin): number;  // for completeness
```

### Initialization sequence

1. User clicks embed to edit → `embedStateAtom` / `embedStateAtom_v2` → `editor`
2. `TldrawWritingEditor` / `TldrawDrawingEditor` mounts, `handleMount` runs
3. In `handleMount`: call `initialize(getObsidianUndoDepth(plugin), getTldrawNumUndos(editor))`
4. Register editor in registry with `embedId`
5. Add store.listen that calls sync just before `queueOrRunStorePostProcesses` in DrawingCompleted/DrawingErased branches
6. On unmount: unregister from registry

---

## Integration points

| Location | Action |
|----------|--------|
| `WritingEmbedWidget` / `DrawingEmbedWidget` | Pass `widget.id` as `embedId` to WritingEmbed / DrawingEmbed |
| `WritingEmbed` / `DrawingEmbed` | Pass `embedId` to TldrawWritingEditor / TldrawDrawingEditor |
| `TldrawWritingEditor.handleMount` | Initialize stack, register editor; sync just before queueOrRunStorePostProcesses in DrawingCompleted/DrawingErased branches |
| `TldrawDrawingEditor.handleMount` | Same as writing |
| `main.ts onload` | Call `registerUnifiedUndoRedo(plugin)` when writing or drawing enabled |

### embedId source

The widget (`WritingEmbedWidget` / `DrawingEmbedWidget`) has `this.id` from `crypto.randomUUID()`. This is passed down as `embedId` so the same instance is consistently identified. The registry and stack use this id.

### Edit-mode check

The keyboard handler uses `getActiveEmbedId()` from the ink-editor-registry. If non-null, an embed is in edit mode and we capture the key.

---

## Dependencies

- **@codemirror/commands**: `undoDepth(state)`, `redoDepth(state)`. Added as devDependency for types; runtime uses Obsidian's bundled version (external in esbuild).
- **Obsidian Editor**: `editor.undo()`, `editor.redo()` on MarkdownView's editor.
- **tldraw Editor**: `editor.undo()`, `editor.redo()`. Undo count via `(editor as any).history?.getNumUndos?.()`.

---

## Technical gotchas

### Programmatic undo/redo and sync placement

Sync runs just before `queueOrRunStorePostProcesses` in the `DrawingCompleted` and `DrawingErased` switch branches. When we call `editor.redo()`, tldraw restores shapes and `store.listen` fires—so sync *does* run during redo. Without a guard, that sync would add entries and clear the redo stack. We use `isProgrammaticRedoInProgress` (see Programmatic redo guard below). For Obsidian: we have no separate Obsidian listener; we only sync from these branches or keydown. Our undo decreases Obsidian's undoDepth, so we only add when depth *increases*.

### Programmatic saves

`props.save()` in `completeSave` and `incrementalSave` writes to the embedded file via `vault.modify`; it does not modify the markdown. So no programmatic Obsidian change occurs and no mitigation is needed.

For the keydown handler: we set a flag before calling Obsidian undo/redo if we ever add an Obsidian-side listener in the future. Currently not required.

### Obsidian editor availability

`plugin.app.workspace.getActiveViewOfType(MarkdownView)?.editor` can be null if:
- No markdown note is focused
- The user switched to a different leaf

When null, we treat undo depth as 0. The handler should not crash.

### tldraw history access

`Editor.history` is protected. We use `(editor as any).history?.getNumUndos?.() ?? 0`. This is brittle if tldraw changes its API but is the only way to get the count without a public API.

### Embed state atoms

Writing and drawing both use per-embed edit state: `embedsInEditModeAtom` (writing) and `embedsInEditModeAtom_v2` (drawing). Each is a `Set<string>` of embedIds, so multiple embeds can be in edit mode at once (both unlocked). The keyboard handler uses `getActiveEmbedId()` (from the ink-editor-registry) when deciding whether to capture; it does not read these atoms directly.

### Two tldraw history marks per logical action

tldraw creates two history marks per draw stroke: one when the shape is added to the store, another when `isComplete` is set to true. We only sync on completion-level activities (e.g. `DrawingCompleted`), so we sync once per stroke—but at that moment `getNumUndos()` has already increased by 2, yielding `tldrawDelta = 2`. Without mitigation, we would add two embed entries per stroke. We cap `tldrawDelta` to 1 for `DrawingCompleted` and `DrawingErased` via `syncUnifiedUndoHistory(..., { maxTldrawDelta: 1 })`, so each stroke produces one embed entry. The keydown handler does not pass this option so all pending tldraw changes are synced before undo/redo.

### Programmatic redo guard

When we call `editor.redo()`, tldraw restores shapes and `store.listen` fires with `source: 'user'`. The sync in the DrawingCompleted/DrawingErased branches would see an increased `getNumUndos()`, add entries, and clear the redo stack—wiping the user's ability to redo further. tldraw's history mark count per redo is not reliably 1 or 2, so we use a flag instead.

**Flag storage:** Stored on the plugin instance (`plugin.__inkProgrammaticRedoInProgress`) so it is shared even if the build produces multiple module instances. The keyboard handler passes the plugin explicitly: `setProgrammaticRedoInProgress(true, plugin)`.

**Timing:** We set the flag before `executeRedo`. We clear it with `setTimeout(..., 50)` in a `finally` block—`store.listen` may run asynchronously (e.g. in a macrotask) after `editor.redo()` returns, so the 50ms delay keeps the flag true long enough for that sync to see it and skip.

**When the flag is set:** Sync updates the baseline (`prevObsidianDepth`, `prevTldrawUndosByEmbed` for this embedId) and returns early—no entries added, redo stack not cleared.

---

## Testing

### Unit tests

- **unified-undo-stack.test.ts** — Tests `initialize`, stack operations (pop/push), `syncUnifiedUndoHistory` with mocked dependencies, `notifyUndoExecuted`/`notifyRedoExecuted` baseline adjustments, and the programmatic redo guard.
- **keyboard-handler.test.ts** — Tests keydown handling: early return when no active embed, undo/redo flow with mocked stack, programmatic redo flag set/clear timing, and Ctrl+Z (Windows/Linux) support.

### E2E tests

- **undo-redo.e2e.ts** — Tests undo/redo in the live Obsidian environment:
  - One embed: embed-only actions (undo twice, redo twice, correct order); mixed embed + Obsidian; programmatic redo guard (redo twice preserves redo stack).
  - Two embeds: Two Embeds (Interleaved) — different ink files; mixed usage (draw E1, E2, E1, E2, E1, E2 with both unlocked, no locking); mixed with Obsidian; mid-sequence lock (skipped until purge-on-lock is implemented).
  - Three embeds: mixed usage (draw E1, E2, E3, E1, E2, E3, assert undo/redo affects correct embeds).

Vault notes: `11 - CodeMirror and Editor Behavior/Undo Redo One Embed.md`, `Undo Redo Two Embeds.md`, `Undo Redo Three Embeds.md` (empty drawing embeds with surrounding text). All undo/redo E2E tests use empty drawing embeds.

### E2E technical gotchas

- **Tldraw mount timing:** Tests wait for `.tl-container` before any interaction; the editor ref is set in `handleMount`, so `findTldrawEditor()` returns null until then. An extra 1000ms settle after the wait allows opacity and registry setup to complete.
- **Undo/redo activation:** Put focus in the Obsidian note (markdown editor, e.g. `.cm-editor` or `.markdown-source-view`) and dispatch `KeyboardEvent` (Mod+Z / Mod+Shift+Z) on `document`. Do not focus the tldraw canvas or simulate undo/redo button clicks.
- **Lock button:** The editor starts with `opacity: 0` until `handleMount`; WebDriver may treat the lock button as not interactable. Tests use a JS click (`browser.execute`) to bypass interactability checks.
- **Preview click in multi-embed:** WebDriver click on previews inside CodeMirror widgets can be unreliable. Tests use `browser.execute` with `querySelectorAll` to click the preview by index.
- **Lock+switch flow:** Use `clickLockAndWait` (waits for editor to unmount) before `clickUnlockByIndex` when switching embeds, so the transition completes before activating the next embed.
- **Per-embed assertions:** Use `getShapeCountInEmbedUnlocked(embedIndex)` when embeds stay unlocked. Use `getShapeCountInEmbed(embedIndex)` with lock-to-switch when the test locks between embeds.
- **Shape-count assertions:** Use `waitForShapeCount` (polling) instead of fixed pauses. Programmatic `createShape` can batch differently than manual drawing; One Embed tests use `waitForShapeCountOneOf` to accept variance.
- **Keyboard events:** Tests use synthetic `KeyboardEvent` dispatch on `document` instead of `browser.keys()` because WebDriver's modifier-key combos (e.g. Cmd+Shift+Z) can be unreliable.

### Limitations

- **Undo of locked-embed actions:** When an embed is locked it is unregistered. Undo of that embed's actions requires unlocking it again; at that moment the previously active embed locks. The implementation uses `getEditor(entry.embedId)` — if the embed is locked, it returns undefined and the undo is a no-op for that entry.
- **Two Identical Embeds (implementation gap):** Multiple embeds linking to the same ink file do not share in-memory state when both are unlocked. Each embed has its own tldraw store; changes in one are not reflected in the other until save/reload. A test covering this scenario was removed as a known gap.
