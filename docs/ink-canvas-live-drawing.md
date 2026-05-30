# Ink canvas: live drawing vs committed strokes

## Why it exists

While the pen is down, users need immediate visual feedback that tracks the stylus. After lift, the stroke must be stored efficiently and rendered consistently with the rest of the canvas. Those goals pull in different directions (dense samples vs merged storage, faithful preview vs pen/mouse smoothing on commit). This page describes how the current-format drawing editor (`InkSvgCanvas` + `draw-tool`) splits that work.

---

## Conceptual understanding

There are two visual layers on the SVG canvas:

| Layer | When it appears | What it represents |
|--------|------------------|-------------------|
| **Live preview** | From `pointerdown` until `pointerup` | In-progress stroke on a temporary `<path>` |
| **Committed stroke** | After `pointerup` | Stroke in the store, rendered like other saved strokes |

Pointer events feed **two point lists** during an active stroke:

| Array | Purpose |
|--------|--------|
| `points` | Merged samples (~1 screen pixel threshold) — saved on pointer up |
| `livePreviewPoints` | Denser, append-only trail — used only to build the live `<path>` |

```mermaid
flowchart LR
  Pen[Pointer events] --> LivePts[livePreviewPoints]
  Pen --> StorePts[points merged]
  LivePts --> LivePath["Live SVG path while drawing"]
  StorePts --> OnUp[Pointer up → stroke store]
  OnUp --> Committed["StrokePath after lift"]
```

Live preview and the committed stroke **intentionally use different outline pipelines** today: live favours following the pen (`getStroke` with `streamline: 0`, `last: true`); committed local strokes use `getInkStrokeOutline` (presets, smoothing, preprocessing). They may not match pixel-for-pixel when the pen lifts.

---

## Flows

### While drawing

```mermaid
sequenceDiagram
  participant User
  participant DrawTool as draw-tool.ts
  participant LivePath as liveStrokeRef path
  participant Store as stroke store

  User->>DrawTool: pointerdown
  DrawTool->>DrawTool: init points + livePreviewPoints
  DrawTool->>LivePath: updateLiveStrokePath

  loop pointermove
    User->>DrawTool: pointermove + samples
    DrawTool->>DrawTool: merge into points
    DrawTool->>DrawTool: append livePreviewPoints
    DrawTool->>LivePath: updateLiveStrokePath
  end
```

### On lift

```mermaid
sequenceDiagram
  participant User
  participant DrawTool as draw-tool.ts
  participant LivePath as liveStrokeRef path
  participant Store as stroke store

  User->>DrawTool: pointerup
  DrawTool->>DrawTool: final samples → points
  DrawTool->>Store: AddStrokeCommand(points)
  DrawTool->>LivePath: clear d attribute
```

Boox / eInk Bridge strokes may bypass parts of this path when ingested over the WebSocket; see [websocket-programmatic-strokes.md](websocket-programmatic-strokes.md) and [boox-companion-integration.md](boox-companion-integration.md).

---

## Technical details

| Piece | Location |
|--------|-----------|
| Live `<path>` element | `src/ink-canvas/ink-svg-canvas.tsx` (`liveStrokeRef`) |
| Pointer handling, dual arrays, live path updates | `src/ink-canvas/tools/draw-tool.ts` |
| Committed stroke rendering | `StrokePath` in `ink-svg-canvas.tsx` (`getInkStrokeOutline` for local strokes) |
| Current-format drawing embed | `src/components/formats/current/drawing/tldraw-drawing-editor/` |

Legacy v1 drawing embeds use tldraw’s canvas directly and do not use this live-path pipeline.

Commit-time **streamline**, **smoothing**, and **mergeNearDuplicatePoints** are scaled by **capture zoom** (reference 1×) so smoothing stays consistent on screen when zoomed in. See [ink-canvas-zoom-scaled-strokes.md](ink-canvas-zoom-scaled-strokes.md).

### Pen pressure capture and the radius slew limit

Pen presets are deliberately **faithful** (low `streamline`/`smoothing` = `0.1`, `thinning = 0.6`), so the brush radius tracks real pressure closely. With faithful settings, a sharp pressure change between **sparsely-sampled fast** points makes the radius lurch; perfect-freehand then offsets the two sides of the outline so they **cross into a self-intersecting bowtie**, which renders as an **"xor-fill" hole** under SVG's default nonzero winding.

The fix is a **per-distance radius slew limit** applied to stored pressure at capture (`draw-tool.ts` → `penPressureSlewLimit`, constant `PEN_PRESSURE_SLEW_PER_SIZE` in `constants/pen-input.ts`):

- It bounds how much pressure (→ radius) may change **per brush-size of page travel** — a limit in *space*, not per-sample or per-time.
- This is **sample-rate / frame-rate independent**: slow strokes still reach full pressure (they cover the distance over many samples), while sparse fast samples can't make the radius jump and pinch the outline.
- It is applied to the **stored** pressure, which both `points` and `livePreviewPoints` share, so **live and committed are fixed in one place**.
- A soft per-sample pressure EMA (`PEN_PRESSURE_SMOOTHING_ALPHA`) still runs first for jitter rejection; the slew limit is the hard cap on top.

```mermaid
flowchart LR
  raw["raw sample pressure"] --> ema["soft EMA (jitter)"]
  ema --> slew["per-distance radius slew limit"]
  slew --> stored["stored pressure on points + livePreviewPoints"]
  stored --> live["live getStroke"]
  stored --> commit["commit getInkStrokeOutline"]
```

---

## Technical Gotchas

- **Do not use `getInkStrokePoints` for live preview** without a live-specific mode: that preprocessor can skip interior samples until path length reaches brush `size`, which looks like a straight chord from start to tip during slow moves.
- **`points` and `livePreviewPoints` must not share the same array references** for the first vertex; merge logic updates `points` in place.
- **Reload the plugin** after changing `draw-tool` or `ink-svg-canvas`; the live path is updated imperatively and will not reflect code changes until Obsidian reloads the plugin build.
- **WYSIWYG** between live and committed is not guaranteed unless product code commits the same trail and outline options used for preview.
- **Capture zoom** — see [ink-canvas-zoom-scaled-strokes.md](ink-canvas-zoom-scaled-strokes.md).
- **Pointer samples** — coalesced expansion in `pointer-samples.ts` is currently **off** (`USE_COALESCED_POINTER_SAMPLES = false`); one sample per `pointermove`. It can be re-enabled and re-QA'd now that the radius slew limit bounds pressure change per distance.
- **"xor-fill" holes are a radius-slew / outline self-intersection symptom, not a sampling-density one.** They come from abrupt pressure→radius change across sparse fast points (see *Pen pressure capture and the radius slew limit*). Removing/thinning points (e.g. a distance gate) does **not** help and can hurt; tune `PEN_PRESSURE_SLEW_PER_SIZE` instead — lower if holes appear on fast strokes, raise if deliberate pressure changes feel damped. A retired accepted-tip distance gate (`stroke-sample-gate.ts`) was removed for this reason.
