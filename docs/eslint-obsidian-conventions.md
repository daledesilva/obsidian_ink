# ESLint and Obsidian plugin conventions

## Why it exists

Obsidian community plugins are reviewed against [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) (UI sentence case, popout-window safety, trash preferences, command naming, and more). This repo uses [`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin) (pinned at **^0.4.1**) so those rules are enforced in CI-adjacent local linting before release, instead of discovering them only at directory submission time.

## Conceptual understanding

Think of the linter as two layers:

1. **Obsidian compatibility** — Code that runs in a popout window must not assume the main window’s globals (`document`, `HTMLImageElement`, bare `requestAnimationFrame`). Obsidian provides `activeDocument`, `activeWindow`, `element.instanceOf(...)`, and window-scoped timers for that.
2. **Directory / UX conventions** — UI copy sentence case, prefer CSS classes over static inline styles, delete via `FileManager.trashFile()` so the user’s trash setting is respected, avoid putting the plugin id/name into command ids/names.

Ink keeps a small set of intentional exceptions. Pen scroll-lock teardown still uses targeted `eslint-disable-next-line obsidianmd/no-static-styles-assignment` comments (literal style writes avoid an unpin flash). Product-name UI strings (Ink, Boox, SVG) may warn under `ui/sentence-case` rather than using disables for every notice.

## Flows

```mermaid
flowchart LR
  edit[Edit src] --> lint["npx eslint ."]
  lint --> pass{Clean of errors?}
  pass -->|yes| build["npm run build / tests"]
  pass -->|no| fix[Fix code or justified disable]
  fix --> lint
```

```mermaid
flowchart TD
  subgraph popout [Popout-safe DOM]
    AD[activeDocument]
    AW[activeWindow / window.rAF]
    IO["element.instanceOf(Type)"]
  end
  subgraph deleteFlow [User-facing delete]
    TF[FileManager.trashFile]
    VD[Vault.delete - avoid]
    TF -->|respects trash setting| trash[System trash or permanent]
    VD -->|always hard path| trash
  end
```

## Technical details

### How to run

There is no dedicated `npm run lint` script yet. From the repo root:

```bash
npx eslint .
npx eslint . --fix   # unused disables and other auto-fixes only
```

Config lives in `eslint.config.mjs`:

- Extends `obsidianmd.configs.recommended` (0.4.x).
- Type-aware Obsidian rules apply to `src/**/*.ts(x)` via `tsconfig.json`.
- Tooling, tests, vault fixtures, manifests, and build output are ignored.
- Local override of `eslint-comments/no-restricted-disable` drops the blanket `obsidianmd/*` denylist so pen scroll-lock can keep described `eslint-disable-next-line` comments. Other dangerous disables (e.g. `no-eval`, SDL innerHTML) stay restricted.

### Conventions applied in this codebase

| Rule / theme | What we do |
|--------------|------------|
| `prefer-active-doc` | Use `activeDocument` instead of global `document` for UI DOM work. Off in recommended for schema keys named `document` (tldraw snapshots) — comment the field, do not disable a disabled rule. |
| `prefer-window-timers` | Use `window.requestAnimationFrame` (and other window timers) so callbacks run on the correct window. |
| `prefer-instanceof` | Use `element.instanceOf(HTMLImageElement)` (etc.) instead of `instanceof` for cross-window checks. |
| `prefer-file-manager-trash-file` | Permanent migrate and “remove and delete file” call `app.fileManager.trashFile`. |
| `no-static-styles-assignment` | Static layout lives in SCSS. Pen scroll-lock unpin keeps literal `style.overflow` / `scrollbarColor` writes with a justified disable (see gotchas). |
| `ui/sentence-case` | Prefer sentence case (warn). Product names may remain as written; expect warnings rather than blanket disables. |

### Migration entry points (no palette commands)

Bulk migration is opened from **Settings** (legacy migrate card and developer tldraw SVG migrate). Per-file migration uses the on-open notice CTA. Command-palette migration commands were removed so they are not a second, lint-violating entry path; e2e and unit tests call `plugin.openMigrationModal()` / `openTldrawSvgMigrationModal()` directly.

### Jest polyfills

jsdom does not ship Obsidian’s extras. `tests/setupTests.ts` polyfills:

- `Node.prototype.instanceOf` → `instanceof`
- `activeDocument` / `activeWindow` → `document` / `window`

Unit tests therefore exercise the same call sites as the plugin under Obsidian.

## Technical Gotchas

- **Flat config only — do not restore `.eslintrc`** — Lint config is solely `eslint.config.mjs`. A legacy `.eslintrc` that referenced `@typescript-eslint/parser` / `@typescript-eslint/eslint-plugin` (not installed; this repo uses `typescript-eslint`) caused Obsidian’s community SOURCE CODE scan to fatal with “couldn't find the plugin.” Keep a single flat config so local `npx eslint .` and any tooling that still loads eslintrc cannot diverge into a hard crash.
- **0.4.x restricts eslint-disable for Obsidian rules** — Recommended config enables `eslint-comments/no-restricted-disable` with `obsidianmd/*`, which rejects every `eslint-disable` for Obsidian rules and requires descriptions on remaining directives. Local config narrows that denylist so justified pen scroll-lock disables still work; the hosted community scanner may still use the full recommended set.
- **Scanner ignores local rule overrides** — community.obsidian.md runs its own `eslint-plugin-obsidianmd` recommended set; turning rules off in `eslint.config.mjs` does not silence the hosted scan.
- **Pen scroll-lock must stay literal inline** — Unpinning `.ink-cm-scroller--scroll-pinned` restores `overflow` / `scrollbarColor` via literal assignments “kept inline to avoid flash on unpin.” Do not replace those with CSS-only teardown or variable-assignment lint tricks without re-testing flash on device. Keep the `-- functional pen scroll-lock` disable reason.
- **`activeDocument` vs schema fields** — A property named `document` on a tldraw snapshot is not the DOM global. Document the field in a JSDoc; `prefer-active-doc` is off in recommended, so an eslint-disable there is unused and unwanted.
- **Sentence-case vs product names** — The rule lowercases many proper nouns (Ink, Boox, SVG) at warn severity. Prefer keeping brand casing in copy; warnings are acceptable until copy is rewritten.
- **`FileManager` in unit tests** — `executeMigration(vault, fileManager, …)` needs a mock with `trashFile` (tests often delegate to the vault mock’s `delete` for assertions).
- **Static vs dynamic styles** — The static-styles rule only flags **literal** assignments (`style.left = '50%'`). Template literals with expressions (dynamic width/height) are allowed; put fixed centering in CSS classes instead.
- **Ignored paths** — `tests/` and root manifests are not linted by this config; production `src/` is. Keep polyfills in `setupTests.ts` aligned with new Obsidian APIs used in `src/`. See also [Manifest minAppVersion and versions.json](manifest-and-versions.md) for community manifest validation (separate from ESLint).
