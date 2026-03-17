# File format and conversion

**Why it exists:** This doc describes the ink SVG file format and how drawing↔writing conversion preserves the visual preview, so future changes do not reintroduce the SVG preview loss bug.

## Format overview

Ink files are SVG files with embedded metadata. The structure is:

```xml
<svg xmlns="..." ...>
  <!-- Visual content: paths, groups, etc. -->
  <metadata>
    <ink plugin-version="..." file-type="inkDrawing|inkWriting"/>
    <tldraw version="...">JSON snapshot</tldraw>
  </metadata>
</svg>
```

The visual content and metadata are siblings under the root `<svg>`. Embeds and the file picker load the SVG file directly; the preview is whatever visual content the file contains.

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
