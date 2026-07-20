# Reading mode embed rendering

## Why it exists

Ink embeds in **Live Preview** are rendered by CodeMirror 6 widgets that mount React components with custom layout, sizing, and preview chrome. **Reading mode** uses Obsidian’s native markdown renderer, which outputs a bare `internal-embed` (or `img`) plus a separate Edit link. Without a dedicated reading-mode path, plugin CSS and dimension logic never run, so embeds look wrong when switching from edit to read view.

Option A adds a **markdown post-processor** that replaces native ink embeds with the same preview components used in Live Preview (read-only).

## Conceptual understanding

```mermaid
flowchart LR
    MD["Note markdown"]
    ObsRenderer["Obsidian reading renderer"]
    NativeEmbed["internal-embed + Edit link"]
    PostProc["Ink MarkdownPostProcessor"]
    RenderChild["InkReadingEmbedHost"]
    Preview["DrawingEmbedPreview / WritingEmbedPreview"]
    MD --> ObsRenderer --> NativeEmbed
    NativeEmbed --> PostProc
    PostProc -->|"parse Edit URL, resolve TFile"| RenderChild
    RenderChild --> Preview
```

Sizing and framing settings live in the **Edit link URL** (`width`, `aspectRatio`, `viewBox*`), not on the image markdown line. The post-processor reads those params and applies the same layout rules as Live Preview preview mode.

## Why Option A (implemented) vs Option B (not implemented)

### Option B — how it would work

On each resize/save, also write dimensions into the image markdown using Obsidian’s pipe syntax, for example:

```md
![InkDrawing|500x281](<Ink/Drawing/example.svg>) [Edit Drawing](...)
```

Reading mode’s native image renderer would size the embed from the pipe dimensions without custom plugin rendering.

### Why we chose Option A instead

| Concern | Option B | Option A |
|---------|----------|----------|
| Drawing viewBox / reframing | Shows the **entire** SVG; cannot apply the framed `viewBox` from the Edit link | `DrawingEmbedPreview` applies `viewBox` so the user sees the crop they configured |
| Full canvas vs framed size | Saved `width` × `aspectRatio` describe the **framed viewport**, not the full canvas. If the embed showed all strokes on a large canvas, a fixed box sized for the current frame would be **too small** — the embed should use as much of the content column as possible. Option B cannot adapt to that. | Framed preview matches what the user set; future full-canvas display can be handled in the preview pipeline |
| Preview chrome | No frames, backgrounds, or writing lines from plugin settings | Reuses preview SCSS and settings |
| Full-bleed (drawings) | Not available | `applyReadingModeAncestorStyling` negates preview padding |
| Writing embeds | Writing already fills 100% content width; height follows aspect ratio — Option B adds little | Same fluid layout as Live Preview |
| Source of truth | Two places to keep in sync (image pipe + Edit URL) on every resize | Edit URL remains canonical; one rendering path |

**Future consideration:** Option B could be added later as an optional fallback (e.g. a plugin setting) for environments where post-processing fails. It is **not implemented** today and is not a substitute for framed drawing previews.

## Flows

1. User opens a note in Reading mode.
2. Obsidian renders `![InkDrawing](<path>) [Edit Drawing](<url>?type=inkDrawing&width=…&aspectRatio=…&viewBox…=…)`.
3. `registerReadingModeInkEmbeds` post-processor runs on each preview section (or on the full `.markdown-preview-view` during PDF export — see [PDF export](#pdf-export)).
4. `findReadingModeInkEmbedCandidates` locates `internal-embed` / `img` + sibling Edit link, parses settings, resolves `TFile` via `context.sourcePath`.
5. Native block is replaced with `InkReadingEmbedHost` (`MarkdownRenderChild`).
6. Host mounts `DrawingEmbedPreview` or `WritingEmbedPreview` inside a sized `.ddc_ink_resize-container`.
7. Drawing embeds call `applyReadingModeAncestorStyling` for full-bleed; writing embeds receive the embed-block class only (same as Live Preview).

## Technical details

| Piece | Location |
|-------|----------|
| Post-processor registration | `src/components/formats/current/reading-mode/register-reading-mode-ink-embeds.ts` |
| Embed detection | `src/logic/utils/detect-reading-mode-ink-embed.ts` |
| React host | `src/components/formats/current/reading-mode/ink-reading-embed-host.tsx` |
| Reading-mode full-bleed | `applyReadingModeAncestorStyling()` in `src/logic/utils/embed.ts` |
| Settings parser (reused) | `src/components/formats/current/utils/parse-settings-from-url.ts` |

**Dimension rules (match Live Preview preview mode):**

- **Drawing:** `width` from settings (capped to preview container width), `height = width / aspectRatio`, centered in the resize container.
- **Writing:** `width: 100%`, `height = containerWidth / aspectRatio`.

Embeds are non-interactive in reading mode (no click-to-edit).

## PDF export

Built-in **Export to PDF** uses the same reading-mode HTML pipeline, not Live Preview widgets. Obsidian renders the note into a temporary print DOM (under `.print`), then converts it with Electron’s `printToPDF`.

```mermaid
flowchart LR
    Note["Note markdown"]
    PrintDOM["Temporary .print preview DOM"]
    PostProc["Ink MarkdownPostProcessor"]
    Preview["DrawingEmbedPreview / WritingEmbedPreview"]
    PDF["Exported PDF"]
    Note --> PrintDOM --> PostProc --> Preview --> PDF
```

### Why the post-processor must handle PDF differently

In **Reading mode**, `registerMarkdownPostProcessor` receives **section-level** elements — `p`, `.el-p`, blockquote wrappers, and similar. Ink scans each block for an embed marker plus its Edit link.

In **PDF export**, Obsidian passes the **entire page** as a single element — typically `.markdown-preview-view.markdown-rendered` — not individual sections. This matches behaviour reported by other plugin authors ([Obsidian forum: post-processors and PDF export](https://forum.obsidian.md/t/export-to-pdf-and-post-processor-seems-not-playing-well/38485)).

If Ink only accepted section roots, the post-processor would return immediately during export. Embeds would stay as native `internal-embed` / `img` nodes, which:

- Show the **full SVG canvas** (no `viewBox` crop from the Edit link)
- Ignore saved **width** and **aspect ratio** (often filling the page)

Drawing reframing is stored in the Edit link URL (`viewBoxX`, `viewBoxY`, `viewBoxWidth`, `viewBoxHeight`, plus `width` and `aspectRatio`). Only `DrawingEmbedPreview` applies that crop after inlining the SVG — native image embeds cannot.

### Lifecycle constraints on full-page export

On the full-page PDF path, Ink mounts fresh `InkReadingEmbedHost` instances for every embed in one pass. Two rules prevent export from hanging:

1. **Skip stale-host remount on full-page roots** — `remountStaleReadingEmbedHostsInRoot` exists to recover cached reading-view DOM when toggling Live Preview ↔ Reading mode. On PDF export, all hosts were just created; running remount synchronously races React commit (host is `ACTIVE` but `.ddc_ink_embed` is not in the DOM yet). The remount path uses `plugin.addChild` instead of `context.addChild`; those orphans never unload when the print DOM is discarded, which can leave Obsidian’s “Exporting to PDF” progress bar stuck even after the file is written.

2. **Defer stale remount elsewhere** — For section-level reading mode, stale recovery runs in `requestAnimationFrame` so React can commit before the “missing embed” check runs.

Implementation: `FULL_PAGE_PREVIEW_ROOT_SELECTOR` and the deferred remount block in `register-reading-mode-ink-embeds.ts`.

### Obsidian print CSS (optional for Ink)

PDF export often requires rules under `@media print { .print … }`. Frontmatter `cssclass` values may not appear on the print DOM. Ink does not ship print-specific CSS today; embed layout comes from the same preview components and inline dimensions as Reading mode. If custom export styling is added later, test against a real PDF export, not just Reading mode.

## Technical gotchas

1. Obsidian may render a `span.internal-embed` rather than `img` — the detector handles both.
2. A previous reverted processor targeted `img` only and used a bare `<img>` without preview components or `viewBox`.
3. The Edit link must be **removed** from the DOM when replacing the block, not only hidden with CSS.
4. Transclusion requires `context.sourcePath` when resolving embed file paths, not the active editor file.
5. Blockquote right-edge overflow is a known Live Preview limitation; reading mode follows the same behaviour.
6. **PDF export uses a full-page post-processor root** — See [PDF export](#pdf-export). Do not remove `FULL_PAGE_PREVIEW_ROOT_SELECTOR` or revert to section-only scan roots without testing reframed drawing exports.
7. **Do not run stale-host remount synchronously after mounting on full-page roots** — Causes a React race and can hang the export progress bar; see [PDF export § Lifecycle constraints](#lifecycle-constraints-on-full-page-export).
8. **Drawing embed centering is CSS, not inline literals** — `.ddc_ink_drawing-embed .ddc_ink_resize-container` owns `position` / `left: 50%` / `translate: -50%`. `applyReadingModeEmbedDimensions` only sets dynamic width/height/maxWidth (Obsidian `no-static-styles-assignment`). Writing width `100%` comes from writing-embed SCSS.

## See also

- [Reading mode](reading-mode.md) — Conceptual overview (non-technical)
- [Ink colours and theming](ink-colours-and-theming.md) — How preview colours follow the theme
- [Ink embeds: contexts and limitations](ink-embeds-contexts-and-limitations.md)
- [UX decisions](ux-decisions.md)
