# Handwriting transcription (writing and drawing)

**Why it exists:** Handwriting in current-format **writing and drawing** SVG files can be turned into searchable, copyable text. The plugin stores the **full markdown transcript** on the ink SVG attachment and a **stripped plain-text cousin** in the note's image embed alt so Live Preview and the CM6 widget stay stable.

Transcription is powered by the Almost Useful account portal (`POST /api/jobs/handwriting-transcription`). Ink never calls OpenRouter directly.

Jobs run through a **plugin-owned serial queue** so transcription survives embed unmount, note close, and Obsidian quit — not React or CodeMirror widget lifetime.

## Conceptual understanding

Two representations serve different jobs:

| Location | Content | Purpose |
|----------|---------|---------|
| SVG `<metadata><transcript>…</transcript>` | Full markdown (newlines, links, emphasis) | Canonical transcript on the attachment; survives without the note |
| `![alt](<path/to.svg>)` image alt | Single-line plain text | Visible in the note; must not break `![…](…)` or Obsidian `alt\|width` sizing |
| `<ink bbox-cells-at-last-transcription="…" last-transcription-at="…"/>` | Occupied 32px cells relative to the stroke bounding box + ISO timestamp | Fingerprint ink at last **successful** transcription; used to skip redundant auto jobs (not a hash of transcript text or SVG markup) |

The embed alt is **not** a second source of truth for markdown — it is a display-safe summary derived from the SVG transcript via [`formatWritingEmbedAltText`](../src/components/formats/current/utils/build-embeds.ts) or [`formatDrawingEmbedAltText`](../src/components/formats/current/utils/build-embeds.ts).

```mermaid
flowchart LR
  User[User: lock / close note / Transcribe]
  Queue[handwriting-transcription-queue]
  Portal[Almost Useful portal vision job]
  Svg["SVG transcript + bboxCellsAtLastTranscription"]
  Alt[formatWritingEmbedAltText / formatDrawingEmbedAltText]
  Note["Note embed alt text"]
  User --> Queue
  Queue --> Portal
  Portal --> Svg
  Portal --> Alt
  Alt --> Note
```

## User flows

### Manual Transcribe (always available)

1. Sign in to Almost Useful in Ink settings (app token required).
2. Open a **writing or drawing** file in the embed editor or dedicated view.
3. Open the overflow menu (⋯).
4. Choose **Transcribe** (no transcript yet) or **Update transcript** (transcript already on the file).
5. The job is enqueued as **manual** (jumps the waiting list; not gated by auto-transcribe toggles).

Manual jobs use the **live canvas** SVG (including unsaved strokes) when enqueued from the editor overflow menu.

### Auto-transcribe on close (vault-synced toggles)

Settings → **Writing** / **Drawing** → **Transcribe handwriting when closing**:

| Setting | Default | Scope |
|---------|---------|--------|
| `writingAutoTranscribeOnClose` | **on** | Writing embed lock, **markdown note/tab close** (unlocked embeds), dedicated writing view close, quit-as-lock, vault modify |
| `drawingAutoTranscribeOnClose` | **off** | Drawing embed lock, **markdown note/tab close** (unlocked embeds), dedicated drawing view close, quit-as-lock, vault modify |
| `writingAutoTranscribeChangeThresholdPercent` | **1** | Writing minimum ink change (0–95%) before auto runs again |
| `drawingAutoTranscribeChangeThresholdPercent` | **1** | Drawing minimum ink change (0–95%) before auto runs again |

Auto enqueue runs only when the per-type toggle is on **and** ink change meets the threshold. Turning a toggle **off** drops **waiting auto** jobs of that type from the device-local queue; it does **not** cancel an in-flight portal POST. Manual pending jobs stay.

### Change threshold (occupied-cell Jaccard %)

Settings → **Writing** / **Drawing** → **Re-transcribe when ink changed by at least** (slider **0–95%**, shown when auto-transcribe on close is on):

The slider is **percent of occupied 32px cells that changed** (Jaccard symmetric-difference / union of bbox-relative cells), not SimHash Hamming bits and not a hash of SVG markup. Page template / ruled-line pixels are not in the cell set — only stroke points.

| Slider | Auto-enqueue when… |
|--------|---------------------|
| **0%** | Other gates pass — **always** re-transcribe, even if occupancy is unchanged |
| **1–95%** | Jaccard change ratio ≥ slider/100, **or** no stored `bboxCellsAtLastTranscription` yet (never successfully transcribed with this fingerprint) |
| Below threshold | Skip auto enqueue |

Default **1%** skips only identical occupancy. **Manual Transcribe** ignores the threshold.

[`inkChangeMeetsAutoTranscribeThreshold`](../src/logic/stroke-bbox-cells.ts) centralises the check in `enqueueAuto`, launch prune, and the worker.

### Vault sync (`vault.on('modify')`)

When an ink SVG changes outside an open editor (Obsidian Sync, external edit, another device), the queue calls `enqueueAuto` if:

- the file parses as current-format ink writing/drawing,
- that type's auto toggle is on,
- the file is **not** in `openSessions` (embed autosave must not loop),
- ink change meets the threshold.

Transcript-only writes from a successful job preserve stroke geometry → at default **1%**, the modify event after apply does **not** re-enqueue. At **0%**, it may.

### Success notification

When a job completes (manual or auto), Obsidian shows e.g. `Writing transcription finished: MyNote.writing`.

**Not auto-enqueued:** expand embed → dedicated view (save on expand, dequeue when dedicated editor opens), empty canvas, or when ink change is **below** the per-type occupancy threshold. Sync/modify while the file is open in an embed or dedicated view is also skipped.

### Queue lifecycle

```mermaid
flowchart TD
  EditStart[Unlock embed or open dedicated view]
  EditEnd[Lock embed / close markdown note / close dedicated view]
  Quit[Plugin onunload / app quit]
  Launch[Plugin onload]

  EditStart --> Dequeue[Remove filePath from pending]
  EditStart --> OpenSet[Persist in openSessions]

  EditEnd --> Save[saveAndHalt or widget unmount completeSave]
  Save --> DropOpen[Unregister session; last drop enqueueAuto]
  DropOpen --> AutoGate{Type auto-transcribe on and threshold met?}
  AutoGate -->|yes| Enqueue[enqueueAuto]
  AutoGate -->|no| SkipAuto[Skip]

  Quit --> FlushSave[Best-effort saveAndHalt]
  Quit --> Promote[Promote openSessions to pending if toggle on]
  Launch --> Merge[Merge leftover openSessions into pending]
  Merge --> Notice[Notice if runnable count > 0]
  Notice --> Grace[Wait 5 seconds]
  Grace --> Worker[Serial worker if signed in]
```

- **One serial worker** for both file types, unique by file path.
- **Manual** jobs sit at the front of **waiting**; never abort an in-flight POST.
- **Launch resume:** after merge/prune, if runnable jobs remain, Obsidian shows e.g. `Resuming handwriting transcription (3 files)`, waits **5 seconds**, then kicks. Unlock/open during grace still **dequeues** that file.
- **Not signed in:** pending jobs stay until sign-in (`ALMOSTUSEFUL_SESSION_CHANGED_EVENT` kicks the worker).

Drawing files and v1 code-block embeds remain out of scope for the queue UI paths.

```mermaid
sequenceDiagram
  participant UI as Embed or dedicated view
  participant Q as handwriting-transcription-queue
  participant Store as au_ink localStorage
  participant Portal as POST /api/jobs/handwriting-transcription
  participant Vault as SVG and notes

  UI->>Q: enqueueAuto / enqueueManual / dequeue
  Q->>Store: persist pending + openSessions
  Q->>Portal: transcribeWriting
  Portal-->>Q: text
  Q->>Vault: saveWriteFileTranscript + bbox occupancy
  Q->>Vault: patch every matching embed alt
```

## Portal integration (production)

| Setting | Value |
|---------|--------|
| Route | `POST /api/jobs/handwriting-transcription` |
| Auth | Almost Useful app token (`ink` / `Ink` attribution) |
| Model | `google/gemini-2.5-flash-lite` |
| Media | Visual-only SVG (`<metadata>` stripped) |
| Page background | Theme-aware opaque rect — white for dark ink, black for light ink (inferred from `ink-color-primary` stroke fills) |

Implementation:

- [`transcribeWriting`](../src/logic/transcribe-writing.ts) — production HTTP entry (full SVG string; used for **both** writing and drawing)
- [`handwriting-transcription-queue.ts`](../src/logic/handwriting-transcription-queue.ts) — serial worker, enqueue/dequeue, launch grace, quit promote
- [`handwriting-transcription-apply.ts`](../src/logic/handwriting-transcription-apply.ts) — vault-wide embed alt patch (open editor or `vault.process`)
- [`postHandwritingTranscriptionJob`](../src/logic/almostuseful/almostuseful-handwriting-transcription.ts) — HTTP client

Errors surface as Obsidian notices: not signed in, `402` insufficient credits, portal error messages.

Eval matrix and live tests remain in the repo for model comparison — not exposed in the UI. See [Eval and live tests](#eval-and-live-tests).

ClickUp decision log (routes, cost table): [Portal AI job routes](https://app.clickup.com/36639212/docs/12y4fc-6596/12y4fc-7656) · Ink summary: [Handwriting transcription](https://app.clickup.com/36639212/docs/12y4fc-7576/12y4fc-7676).

## Queue persistence (device-local only)

**Do not put the pending queue in `data.json`.** A synced job list would double-bill across devices.

| Key | Storage | Content |
|-----|---------|---------|
| `au_ink_handwritingTranscriptionQueue_v2` | `localStorage` via [`storage.ts`](../src/logic/utils/storage.ts) | `pending[]` + `openSessions[]` |

Pending job fields: `filePath`, `fileType` (`inkWriting` \| `inkDrawing`), `reason` (`auto` \| `manual`), `bboxCellsAtLastTranscription` (live occupancy at enqueue; empty on quit-promote until prune), `enqueuedAt`.

v1 blobs (`handwritingTranscriptionQueue_v1` with SimHash snapshots) are **not migrated** — a missing or non-v2 blob reads as empty pending/openSessions.

See [Plugin memory and persistence](plugin-memory-and-persistence.md).

Auto-transcribe **preferences** (`writingAutoTranscribeOnClose`, `drawingAutoTranscribeOnClose`, and the matching `*ChangeThresholdPercent` sliders) **do** live in vault-synced `data.json` — they are user preferences, not job state.

## Occupancy fingerprint (`bboxCellsAtLastTranscription`)

Not SimHash and not a hash of SVG tags. Unique **32px cells** of stroke points, origin at the stroke bounding-box min X/Y (plus each stroke’s offset). Serialized as sorted `cellX,cellY` joined by `|`.

- [`serializeBboxCellsAtLastTranscription`](../src/logic/stroke-bbox-cells.ts) — live occupancy string
- [`bboxCellsJaccardChangeRatio`](../src/logic/stroke-bbox-cells.ts) — `0` identical cell sets, `1` disjoint
- [`inkChangeMeetsAutoTranscribeThreshold`](../src/logic/stroke-bbox-cells.ts) — slider 0–95% vs stored cells
- `lastTranscriptionAt` — ISO-8601 written on successful apply; diagnostic only

**Written only after a successful portal apply** (`saveWriteFileTranscript` with fingerprint). Stroke saves copy the on-disk snapshot via [`preserveBboxCellsOnStrokeSave`](../src/components/formats/current/utils/preserve-bbox-cells-on-stroke-save.ts) so live ink can diverge while stored cells still mean “last successful transcription.”

Old `svg-content-hash` / `svg-content-hashed-at` attributes are no longer written. Files without `bbox-cells-at-last-transcription` always meet the auto threshold (treated as never transcribed with this fingerprint).

## SVG storage: `<transcript>` element

Full markdown is written as a sibling of `<ink>` inside `<metadata>`:

```xml
<metadata>
  <ink plugin-version="…" file-type="inkWriting"
       bbox-cells-at-last-transcription="0,0|1,0|1,1"
       last-transcription-at="2026-03-21T12:00:00.000Z"/>
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

[`saveWriteFileTranscript`](../src/components/formats/current/utils/needsTranscriptUpdate.ts) updates transcript and optional occupancy fields (preserves file `mtime` so the change does not look like a stroke edit).

## Embed alt stripping

[`formatWritingEmbedAltText`](../src/components/formats/current/utils/build-embeds.ts) / [`formatDrawingEmbedAltText`](../src/components/formats/current/utils/build-embeds.ts) rules:

1. Missing or empty after processing → `InkWriting` / `InkDrawing` placeholder.
2. CR/LF/tabs → spaces; collapse runs of whitespace.
3. Remove `[` `]` `\` `|` `<` `>` (break or hijack the image token / Obsidian sizing).
4. Keep `*`, `_`, `~`, `(`, `)` — they do not terminate the alt.

Vault-wide alt patch: [`patchInkEmbedTranscriptAltsInVault`](../src/logic/handwriting-transcription-apply.ts) matches `![any alt](<path>)` plus `type=inkWriting` or `type=inkDrawing` in the edit URL.

## Editor lifecycle: session registry

While an embed is unlocked or a dedicated view is open, [`registerTranscriptionEditorSession`](../src/logic/handwriting-transcription-queue.ts) registers `saveAndHalt` by file path (refcount if the same SVG is open in two places), **dequeues** pending work for that path, and persists `openSessions`.

The serial worker **skips auto jobs** while that file still has an open session. Lock therefore unregisters in `saveAndHalt` **before** `enqueueAuto`, because React unmount is async.

Closing a **markdown note without locking** does not call the embed lock path. CodeMirror `WidgetType.destroy` must **unmount the React root**; the editor cleanup finishes `completeSave` then unregisters. The last session drop calls `enqueueAuto` (same gates as lock). Destroy without unmount leaked sessions and skipped transcription.

Editors do **not** write occupancy on stroke save. [`preserveBboxCellsOnStrokeSave`](../src/components/formats/current/utils/preserve-bbox-cells-on-stroke-save.ts) copies `bboxCellsAtLastTranscription` / `lastTranscriptionAt` from disk. [`buildInkCanvasWritingFileData`](../src/components/formats/current/utils/build-file-data.ts) / [`buildInkCanvasDrawingFileData`](../src/components/formats/current/utils/build-file-data.ts) pass transcript (and preserved occupancy) on each save.

On successful queue apply, `onTranscriptApplied` updates editor refs and embed widgets patch note alts via `updateEmbedTranscript` on the CM6 extension. If the note is already closed, [`patchInkEmbedTranscriptAltsInVault`](../src/logic/handwriting-transcription-apply.ts) writes the closed markdown file.

## Eval and live tests

Fixtures: `tests/fixtures/handwriting-transcription/` (three real writing SVGs + expected transcripts).

Eval matrix: 5 models × 2 media (SVG / PNG) = 10 variants via [`transcribeHandwritingVariant`](../src/logic/handwriting-transcription-variants.ts). Live auth defaults to the `testing` OAuth client (not production `ink`).

```bash
HANDWRITING_TRANSCRIPTION_LIVE=1 npm run test:unit -- tests/logic/handwriting-transcription-live.test.ts
```

PNG raster eval uses `@napi-rs/canvas` in Node (dev dependency only — not bundled into the plugin). Regenerate fixture PNGs: `npx tsx tests/fixtures/handwriting-transcription/render-eval-pngs.ts`.

## Technical gotchas

- **Do not store full markdown in the embed alt.** Newlines and `[` `]` break Obsidian image syntax and the CM6 embed widget regex.
- **Do not put transcript on an `<ink>` attribute.** XML attribute normalization collapses newlines; use the `<transcript>` element.
- **Do not put the job queue in `data.json`.** Device-local only — avoids multi-device double billing.
- **Tldraw saves and `xml-formatter`.** If `<transcript>` is inside the block passed to the formatter, indent whitespace can corrupt markdown. The tldraw path inserts the compact element after formatting.
- **Send visual SVG with opaque page to the portal.** Raw metadata JSON wastes tokens; transparent SVG backgrounds caused Gemini to return numbered-list junk instead of transcribing. Theme-aware page contrast matches eval findings.
- **Production uses SVG only.** PNG rasterization exists for eval variants, not the shipped Transcribe menu.
- **Threshold 0% re-transcribes on every auto path**, including after transcript-only `vault.modify` from apply.
- **Occupancy is bbox cells, not Hamming.** SimHash understated large handwriting edits (similar bit patterns while cells changed a lot). The slider is Jaccard of 32px cells relative to stroke min X/Y.
- **Do not fingerprint SVG markup.** Grid lines and `<ink>` attribute churn would dominate.
- **Fingerprint only after success.** Stroke save must preserve on-disk cells; writing live occupancy on autosave made later locks look “already transcribed.”
- **Unregister before lock `enqueueAuto`.** An open session makes `kick` skip auto jobs.
- **Unmount React in widget `destroy`.** Markdown tab close does not lock embeds; without unmount the session stays open and auto never runs.
- [`needsTranscriptUpdate`](../src/components/formats/current/utils/needsTranscriptUpdate.ts) still returns `false` — do not revive dormant React `fetchTranscriptIfNeeded` effects.
- **Quit may miss the last unsaved stroke.** Transcribe what is on disk after best-effort `saveAndHalt`.
- **Expand-to-dedicated does not auto-enqueue.** Dedicated registration dequeues; user continues editing the same file.
- **Re-save to migrate.** Files that still have `transcript="…"` on `<ink>` load correctly; the next transcribe or transcript save rewrites the `<transcript>` element.
- **Transcript is not rendered as markdown in the note UI** — only stored and reflected as plain alt text.
- **Sign-in required.** Transcription debits Pool A credits through the portal; unsigned users keep pending until sign-in.

## Related docs

- [Almost Useful account (Ink settings)](almostuseful-account.md) — login and credit charts
- [File format and conversion](file-format-and-conversion.md) — overall SVG metadata layout
- [Plugin memory and persistence](plugin-memory-and-persistence.md) — vault files vs settings vs queue
