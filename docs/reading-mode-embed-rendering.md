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
3. `registerReadingModeInkEmbeds` post-processor runs on each preview section.
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

## Technical gotchas

1. Obsidian may render a `span.internal-embed` rather than `img` — the detector handles both.
2. A previous reverted processor targeted `img` only and used a bare `<img>` without preview components or `viewBox`.
3. The Edit link must be **removed** from the DOM when replacing the block, not only hidden with CSS.
4. Transclusion requires `context.sourcePath` when resolving embed file paths, not the active editor file.
5. Blockquote right-edge overflow is a known Live Preview limitation; reading mode follows the same behaviour.

## See also

- [Reading mode](reading-mode.md) — Conceptual overview (non-technical)
- [Ink colours and theming](ink-colours-and-theming.md) — How preview colours follow the theme
- [Ink embeds: contexts and limitations](ink-embeds-contexts-and-limitations.md)
- [UX decisions](ux-decisions.md)
