# Copilot Instructions for this repo

Purpose: This is an Obsidian plugin (“Ink”) that adds handwriting and drawing embeds inside Markdown notes using tldraw. Agents should understand the plugin flow, file formats, embed conventions, and build/release workflow to be productive.

## Architecture at a glance
- Entry point: `src/main.ts`
  - Loads/saves `PluginSettings` (`src/types/plugin-settings.ts`), registers settings tab, icons, commands, views, and Markdown embeds (widgets).
  - Feature flags: `writingEnabled` / `drawingEnabled` gate registrations.
- Embeds (key concept)
  - Embed keys: `WRITE_EMBED_KEY = 'handwritten-ink'`, `DRAW_EMBED_KEY = 'handdrawn-ink'` in `src/constants.ts`.
  - Builder utilities: `buildWritingEmbed`, `buildDrawingEmbed` in `src/utils/embed.ts`. These emit fenced code blocks with JSON payload.
  - Renderers: registered in `src/extensions/widgets/*-embed-widget.tsx` as `MarkdownRenderChild` React roots.
- File formats
  - Extensions: `.writing`, `.drawing` (see `WRITE_FILE_EXT`, `DRAW_FILE_EXT`).
  - JSON shape: `InkFileData` in `src/utils/page-file.ts` → `{ meta: { pluginVersion, tldrawVersion, ... }, tldraw: TLEditorSnapshot, previewUri? }`.
  - Default TL snapshots: `src/defaults/default-tleditor-writing-snapshot.ts`, `src/defaults/default-tleditor-drawing-snapshot.ts`.
- Views/UI
  - Writing and drawing views: `src/views/writing-view.tsx`, `src/views/drawing-view.tsx` (registered via `registerWritingView` / `registerDrawingView`).
  - tldraw usage examples: `src/tldraw/tldraw-page-preview.tsx` and components under `src/tldraw/**`.

## Core data flow (example: insert new handwriting)
1) Command added in `main.ts` → `insertNewWritingFile`.
2) `create-new-writing-file.ts` builds `InkFileData` via `buildWritingFileData` and default snapshot; creates the file in the vault.
3) Editor insertion uses `buildWritingEmbed(filepath)` to add a fenced code block with embed JSON.
4) Markdown post-processor (widget) detects the code block key and mounts a React component.

## Paths, storage, and conventions
- Attachment base path selection in `src/utils/getBaseAttachmentPath.ts` uses settings:
  - `obsidian` (Obsidian attachment dir), `note` (current note folder), `root` (vault root).
- Subfolders: `getWritingSubfolderPath` / `getDrawingSubfolderPath` in `src/utils/getSubfolderPaths.ts` honor `DEFAULT_SETTINGS` vs per-user settings.
- New filenames: `getDateFilename()` + `getVersionedFilepath()` used by `getNewTimestamped*Filepath` in `src/utils/file-manipulation.ts`.
- Always stringify InkFileData via `stringifyPageData` (tabs preserved) when creating files.
- Absolute imports assume `baseUrl` at repo root; use paths like `import X from 'src/utils/...'`.

## Building, testing, and running
- Dev watch: `npm run dev` → `esbuild.config.mjs` bundles `src/main.ts` to `dist/`, compiles SCSS, inlines SVG, copies `src/static/**`, copies `manifest.json` and `manifest-beta.json`, and renames `main.css` → `styles.css` for Obsidian.
- Type check + bundle: `npm run build` → `tsc -noEmit -skipLibCheck` then esbuild in production mode (no sourcemaps, tree-shaking).
- Tests: `npm test` (Jest) with coverage to `coverage/`. `jest.config.ts` sets `modulePaths` so absolute imports from `src/` work.
- Obsidian loading: Obsidian loads from `dist/`. Ensure your vault’s `.obsidian/plugins/ink` points at this repo (or copy `dist` there) when testing locally.

## Releases and versions
- Version bump: `npm version <x.y.z>` triggers `version-bump.mjs` via `scripts.version` to update `manifest.json` and `versions.json`.
- Release tags:
  - Internal smoke: `npm run internal-release` → tag `internal-test`.
  - Beta: `npm run beta-release -- <x.y.z>` → tags `<x.y.z>-beta` and prompts manual release notes.
  - Public: `npm run public-release -- <x.y.z>` → tags `<x.y.z>` and prompts manual notes.

## Adding features safely (patterns to follow)
- New commands: see `src/commands/insert-new-writing-file.ts` and `insert-existing-writing-file.ts` for patterns using Obsidian `Editor` and embed builders.
- New embed type: define a constant key, add a builder in `src/utils/embed.ts`, register a Markdown widget, and handle JSON payload parsing and rendering.
- Vault file ops: use `createFoldersForFilepath`, `plugin.app.vault.create`, and existing path utilities (`parseFilepath`, `getObsidianAttachmentFolderPath`).
- UI theming and behavior: prefer utilities in `src/utils/tldraw-helpers.ts` and constants in `src/constants.ts` (stroke limits, dimensions, delays).

## Integration notes
- Obsidian APIs used: `Plugin`, `addIcon`, `PluginSettingTab`, `Editor`, `MarkdownRenderChild`, vault file APIs, fuzzy suggest modals.
- tldraw: use `TLEditorSnapshot` for storage; React `Editor` configuration lives in components under `src/tldraw/**`.

Questions or unclear areas to refine? For example: exact dev vault linking steps, embed widget lifecycle, or where to add new Redux/Jotai state. Tell me what you want clarified and I’ll adjust this guide.