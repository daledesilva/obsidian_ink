# Writing transcription

**Why it exists:** Handwriting in writing files can be turned into searchable, copyable text. The plugin stores the **full markdown transcript** on the ink SVG attachment and a **stripped plain-text cousin** in the note’s image embed alt so Live Preview and the CM6 widget stay stable.

## Conceptual understanding

Two representations serve different jobs:

| Location | Content | Purpose |
|----------|---------|---------|
| SVG `<metadata><transcript>…</transcript>` | Full markdown (newlines, links, emphasis) | Canonical transcript on the attachment; survives without the note |
| `![alt](<path/to.svg>)` image alt | Single-line plain text | Visible in the note; must not break `![…](…)` or Obsidian `alt\|width` sizing |

The embed alt is **not** a second source of truth for markdown — it is a display-safe summary derived from the SVG transcript via [`formatWritingEmbedAltText`](../src/components/formats/current/utils/build-embeds.ts).

```mermaid
flowchart LR
  User[User: Transcribe / Update transcript]
  Stub[transcribeWriting stub]
  Svg["SVG meta.transcript in transcript element"]
  Alt[formatWritingEmbedAltText]
  Note["Note embed alt text"]
  User --> Stub
  Stub --> Svg
  Stub --> Alt
  Alt --> Note
```

## User flow (current format only)

Transcription is **manual** — there is no automatic transcribe on preview or lock.

1. Open a **writing** file in the embed editor or dedicated writing view.
2. Open the overflow menu (⋯).
3. Choose **Transcribe** (no transcript yet) or **Update transcript** (transcript already on the file).
4. The plugin calls [`transcribeWriting`](../src/logic/transcribe-writing.ts) (currently a stub returning `'transcribed'`), saves the result to the SVG, then:
   - **Embed context:** also patches the markdown image alt in the note via [`updateEmbedTranscript`](../src/components/formats/current/writing/writing-embed-extension/writing-embed-extension.tsx).
   - **Dedicated view:** SVG only (no note alt to update).

Drawing files and v1 `.writing` code-block embeds are out of scope.

```mermaid
sequenceDiagram
  participant UI as Writing editor overflow menu
  participant TW as transcribeWriting
  participant Save as completeSave / buildFileStr
  participant Vault as Vault SVG file
  participant CM6 as writing-embed-extension
  participant Note as Markdown note

  UI->>TW: handleTranscribe
  TW-->>UI: transcript string
  UI->>Save: transcriptRef + ink save
  Save->>Vault: modify SVG with transcript element
  alt embed context
    UI->>CM6: onTranscriptSaved
    CM6->>Note: patch ![alt] in embed snippet
  end
```

## SVG storage: `<transcript>` element

Full markdown is written as a sibling of `<ink>` inside `<metadata>`:

```xml
<metadata>
  <ink plugin-version="…" file-type="inkWriting" …/>
  <transcript>**bold**

[line](https://example.com)</transcript>
  <ink-canvas version="…">…</ink-canvas>
</metadata>
```

- Emitted only when `meta.transcript` is non-empty.
- Text is XML-escaped (`&`, `<`, `>`) via `escapeXmlText` — **not** CDATA.
- The legacy `transcript="…"` attribute on `<ink>` is **no longer written**; [`readInkTranscript`](../src/logic/utils/extractInkJsonFromSvg.ts) still reads it for files saved during the brief attribute experiment.

**Save paths:**

| Engine | Builder | Transcript insertion |
|--------|---------|-------------------|
| ink-canvas | [`buildInkCanvasFileStr`](../src/components/formats/current/utils/buildFileStr.ts) | Included in the metadata string splice (no whole-file formatter) |
| legacy tldraw | [`buildTldrawFileStr`](../src/components/formats/current/utils/buildFileStr.ts) | Spliced **after** `xml-formatter` so pretty-print does not inject whitespace into markdown body text |

[`saveWriteFileTranscript`](../src/components/formats/current/utils/needsTranscriptUpdate.ts) updates transcript only (preserves file `mtime` so the change does not look like a stroke edit).

## Embed alt stripping

[`formatWritingEmbedAltText`](../src/components/formats/current/utils/build-embeds.ts) rules:

1. Missing or empty after processing → `InkWriting` placeholder.
2. CR/LF/tabs → spaces; collapse runs of whitespace.
3. Remove `[` `]` `\` `|` `<` `>` (break or hijack the image token / Obsidian sizing).
4. Keep `*`, `_`, `~`, `(`, `)` — they do not terminate the alt.

Used by [`buildWritingEmbedLine`](../src/components/formats/current/utils/build-embeds.ts) and [`patchWritingEmbedTranscriptInEmbedSnippet`](../src/components/formats/current/utils/build-embeds.ts).

## Editor lifecycle: `transcriptRef`

The writing editor keeps `transcriptRef` so routine stroke autosaves do not drop a transcript that was loaded or saved earlier in the session. [`buildInkCanvasWritingFileData`](../src/components/formats/current/utils/build-file-data.ts) passes `transcript` into `meta` on each save.

## Technical gotchas

- **Do not store full markdown in the embed alt.** Newlines and `[` `]` break Obsidian image syntax and the CM6 embed widget regex.
- **Do not put transcript on an `<ink>` attribute.** XML attribute normalization collapses newlines; use the `<transcript>` element.
- **Tldraw saves and `xml-formatter`.** If `<transcript>` is inside the block passed to the formatter, indent whitespace can corrupt markdown. The tldraw path inserts the compact element after formatting.
- **Stub only.** Real handwriting recognition is not wired; replacing `transcribeWriting` is the integration point for a future service.
- **Auto-transcribe is off.** [`needsTranscriptUpdate`](../src/components/formats/current/utils/needsTranscriptUpdate.ts) always returns `false`; [`fetchTranscriptIfNeeded`](../src/components/formats/current/utils/fetchTranscript.ts) is dormant until product enables it.
- **Re-save to migrate.** Files that still have `transcript="…"` on `<ink>` load correctly; the next transcribe or transcript save rewrites the `<transcript>` element.
- **Transcript is not rendered as markdown in the note UI** — only stored and reflected as plain alt text.

## Related docs

- [File format and conversion](file-format-and-conversion.md) — overall SVG metadata layout
- [Plugin memory and persistence](plugin-memory-and-persistence.md) — vault files vs settings
