# File format and conversion

**Why it exists:** This doc describes the ink SVG file format and how drawing↔writing conversion preserves the visual preview, so future changes do not reintroduce the SVG preview loss bug.

## Format overview

Ink files are SVG files with embedded metadata. The visual content and metadata are siblings under the root `<svg>`. Embeds and the file picker load the SVG file directly; the preview is whatever visual content the file contains.

**Current engine (ink-canvas)** — stroke data in a plugin-specific snapshot:

```xml
<svg xmlns="..." ...>
  <!-- Visual content: paths from ink-canvas export -->
  <metadata>
    <ink plugin-version="..." file-type="inkDrawing|inkWriting"/>
    <ink-canvas version="0.5.0">JSON InkCanvasSnapshot</ink-canvas>
  </metadata>
</svg>
```

**Legacy engine (tldraw)** — still present on older files until the user edits and saves (lazy upgrade to ink-canvas):

```xml
<metadata>
  <ink plugin-version="..." file-type="inkDrawing|inkWriting"/>
  <tldraw version="2.4.3">JSON TLEditorSnapshot</tldraw>
</metadata>
```

Embed **Edit** links in markdown carry display settings (`width`, `viewBox`, etc.) only — not the ink-canvas format version. Format version lives on the SVG file.

## Ink-canvas format version

`INK_CANVAS_FORMAT_VERSION` in [`src/constants.ts`](../src/constants.ts) is the canonical semver for the **`version` attribute** on `<ink-canvas>` (e.g. `version="0.5.0"`). It describes the **functionality and structure** of the **ink-canvas format**: a custom ink payload defined and consumed by this plugin, distinct from:

- **`PLUGIN_VERSION`** on `<ink plugin-version="…">` — which Obsidian Ink build wrote the file.
- **`TLDRAW_VERSION`** on `<tldraw version="…">` — the tldraw library snapshot format (legacy files only).
- **`InkCanvasSnapshot.version`** inside the JSON (currently always `1`) — an internal snapshot schema revision, not the semver on the XML tag.

### Semver rules

| Segment | Meaning |
|--------|---------|
| **Major** | Breaking format changes — structure or semantics that older plugin versions cannot safely interpret without migration. |
| **Minor** | Non-breaking format changes — new optional fields or behaviour; files remain loadable on older readers within the same major. |
| **Patch** | Tweaks, bug fixes, and development iterations within the same compatibility band. |

When saving ink-canvas files, the plugin writes the current `INK_CANVAS_FORMAT_VERSION` via [`buildFileStr`](../src/components/formats/current/utils/buildFileStr.ts) and [`svg-export`](../src/ink-canvas/svg-export.ts). Loaders do not currently reject unknown `<ink-canvas version>` values; bump the constant when the on-disk format changes and add migration if the change is major.

### Technical gotchas

- Files may still show `<ink-canvas version="1">` from early ink-canvas builds; they load normally and are rewritten to the current semver on the next save.
- Do not confuse `<ink-canvas version="…">` with embed URL query parameters — URL `version=` was removed; only the SVG metadata carries format version.

## Drawing ↔ writing conversion

Conversion between `inkDrawing` and `inkWriting` changes only the tldraw store (adds/removes `writing-container` and `writing-lines` shapes) and the `file-type` attribute. The visual SVG content must be preserved so the preview does not disappear.

### Flow

1. **Close open ink views.** Any workspace leaves showing this file in the writing or drawing view are detached first. This prevents `getViewData()` from overwriting the converted file when those views save.
2. (Optional) Move the file to the target subfolder if the user chose "Also move file to …".
3. Read full file content from vault (`svgStr`).
4. Extract metadata via `extractInkJsonFromSvg(svgStr)` → `{ meta, tldraw }`.
5. Transform data: `convertWriteDataToDraw` or `convertDrawDataToWrite`.
6. Build new file: `buildFileStr({ ...converted, svgString: svgStr })`.
7. Write to vault.
8. Update all markdown notes that embed the file.
9. **Open in correct view.** After conversion, the file is opened in the matching view type (drawing view for `inkDrawing`, writing view for `inkWriting`).

### Technical gotchas

- **`buildFileStr` expects full SVG content.** The `svgString` parameter must be the complete SVG file (including any existing metadata). When re-serializing an existing file (e.g. during conversion), pass the raw file content, not `data.svgString` — `extractInkJsonFromSvg` does not return `svgString`.
- **`buildFileStr` strips existing metadata before appending.** When the input `svgString` already contains `<metadata>`, `buildFileStr` removes those elements before adding the new metadata. This avoids duplicate metadata and ensures `extractInkJsonFromSvg` reads the correct data on the next load.
