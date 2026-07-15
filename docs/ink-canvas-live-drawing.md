# Ink canvas: live drawing vs committed strokes

## Why it exists

While the pen is down, users need immediate visual feedback that tracks the stylus. After lift, the stroke must be stored efficiently and rendered consistently with the rest of the canvas. The product requirement is **WYSIWYG**: the committed stroke must look exactly like the live preview.

On long pages, updating a live `<path>` inside the same SVG that holds hundreds of committed strokes can still hitch while the pen is down. Live preview therefore draws onto a **separate HTML `<canvas>` overlay**; the SVG only gains the stroke **on pointer up** (the same lift timing used when eInk Bridge / Boox commits a finished stroke).

This page describes how the current-format editor (`InkSvgCanvas` + `draw-tool`) keeps a **single point array** and a **single outline pipeline** across both layers.

ClickUp: [Canvas based writing](https://app.clickup.com/t/86d3q1v1v) (`86d3q1v1v`).

---

## Conceptual understanding

There are two visual layers:

| Layer | When it appears | What it represents |
|--------|------------------|-------------------|
| **Live preview** | From `pointerdown` until `pointerup` | In-progress stroke on a transparent HTML `<canvas>` overlay |
| **Committed stroke** | After `pointerup` | Stroke in the store, rendered as SVG `StrokePath` like other saved strokes |

Pointer events feed **one point list** during an active stroke:

| Array | Purpose |
|--------|--------|
| `points` | Merged samples (~1 screen pixel threshold) — drives the live canvas AND is saved on pointer up |

The last point is **replaced in place or appended** using a **hybrid merge** (~1 px threshold plus a slow-draw time gate) so fast strokes stay smooth and slow curves stay faithful. See [ink-canvas-point-merge.md](ink-canvas-point-merge.md).

```mermaid
flowchart LR
  Pen[Pointer events] --> StorePts[points merged]
  StorePts --> LiveCanvas["Live HTML canvas while drawing"]
  StorePts --> OnUp[Pointer up → stroke store]
  OnUp --> Committed["SVG StrokePath after lift"]
  OnUp --> Clear["Clear canvas next frame"]
```

Live preview and the committed stroke use the **same array, the same function, and the same options**: both call `getStroke(points, toStrokeOptions(style))`, then `getSvgPathFromStroke`. The live layer fills that path via `Path2D` on the canvas; the committed layer uses the same `d` string on an SVG `<path>`. Because the inputs are identical, the committed stroke matches the preview (WYSIWYG). The per-input look (faithful pen vs smoother mouse) comes entirely from `style.streamline`/`smoothing` in the preset and applies equally to both layers.

---

## Flows

### While drawing

```mermaid
sequenceDiagram
  participant User
  participant DrawTool as draw-tool.ts
  participant LiveCanvas as liveStrokeCanvasRef
  participant Store as stroke store

  User->>DrawTool: pointerdown
  DrawTool->>DrawTool: init points
  DrawTool->>LiveCanvas: paintLiveStrokeOnCanvas

  loop pointermove
    User->>DrawTool: pointermove + samples
    DrawTool->>DrawTool: hybrid merge into points (append or replace tip)
    DrawTool->>LiveCanvas: paintLiveStrokeOnCanvas (getStroke on points)
  end
```

### On lift

```mermaid
sequenceDiagram
  participant User
  participant DrawTool as draw-tool.ts
  participant LiveCanvas as liveStrokeCanvasRef
  participant Store as stroke store

  User->>DrawTool: pointerup
  DrawTool->>DrawTool: final samples → points
  DrawTool->>Store: AddStrokeCommand(points)
  DrawTool->>LiveCanvas: clear next animation frame
```

Boox / eInk Bridge strokes may bypass the live canvas when ingested over the WebSocket (they arrive as complete strokes); see [websocket-programmatic-strokes.md](websocket-programmatic-strokes.md) and [boox-companion-integration.md](boox-companion-integration.md).

---

## Technical details

| Piece | Location |
|--------|-----------|
| Live `<canvas>` overlay | `src/ink-canvas/ink-svg-canvas.tsx` (`liveStrokeCanvasRef`) + `.ink-svg-canvas-live-overlay` |
| Canvas paint / clear / colour resolve | `src/ink-canvas/utils/live-stroke-canvas.ts` |
| Pointer handling, `points` array, live updates | `src/ink-canvas/tools/draw-tool.ts` |
| Committed stroke rendering | `StrokePath` in `ink-svg-canvas.tsx` — same `getStroke` + `getSvgPathFromStroke` as live |
| Off-screen mounts + path cache | Viewport culling and cached path `d` — see [ink-canvas-stroke-viewport-culling.md](ink-canvas-stroke-viewport-culling.md) |
| Current-format drawing embed | `src/components/formats/current/drawing/` |

Legacy v1 drawing embeds use tldraw’s canvas directly and do not use this live-canvas pipeline.

**Camera:** the overlay is screen-sized (DPR-aware). Each paint applies `scale(zoom) translate(x, y)` on the 2D context so page-space outlines line up with the SVG camera group.

**Streamline** and **smoothing** are scaled by **capture zoom** (reference 1×) in the preset (`buildInkStrokeStyleForTreatAs`) so smoothing stays consistent on screen when zoomed in. The scaled values live on `style`, so `getStroke` honours them for **both** live and committed equally. See [ink-canvas-zoom-scaled-strokes.md](ink-canvas-zoom-scaled-strokes.md).

### Pen pressure capture and the radius slew limit

Pen presets are deliberately **faithful** (low `streamline`/`smoothing` = `0.1`, `thinning = 0.6`), so the brush radius tracks real pressure closely. With faithful settings, a sharp pressure change between **sparsely-sampled fast** points makes the radius lurch; perfect-freehand then offsets the two sides of the outline so they **cross into a self-intersecting bowtie**, which renders as an **"xor-fill" hole** under SVG's default nonzero winding.

The fix is a **per-distance radius slew limit** applied to stored pressure at capture (`draw-tool.ts` → `penPressureSlewLimit`, constant `PEN_PRESSURE_SLEW_PER_SIZE` in `constants/pen-input.ts`):

- It bounds how much pressure (→ radius) may change **per brush-size of page travel** — a limit in *space*, not per-sample or per-time.
- This is **sample-rate / frame-rate independent**: slow strokes still reach full pressure (they cover the distance over many samples), while sparse fast samples can't make the radius jump and pinch the outline.
- It is applied to the **stored** pressure on `points` — the one array both layers render — so **live and committed are fixed in one place**.
- A soft per-sample pressure EMA (`PEN_PRESSURE_SMOOTHING_ALPHA`) still runs first for jitter rejection; the slew limit is the hard cap on top.

```mermaid
flowchart LR
  raw["raw sample pressure"] --> ema["soft EMA (jitter)"]
  ema --> slew["per-distance radius slew limit"]
  slew --> stored["stored pressure on points"]
  stored --> render["getStroke(points, toStrokeOptions) — live AND commit"]
```

---

## Technical Gotchas

- **WYSIWYG depends on the single shared call.** Live and committed parity holds only because both render `getStroke(points, toStrokeOptions(style))` then `getSvgPathFromStroke` on the same `points`. If you reintroduce a preview-only point array, an outline preprocessor, or a per-layer option override, they will diverge again. Apply any such change to **both layers** or keep it out of the render path.
- **`currentColor` on canvas** must be resolved via `getComputedStyle` on the canvas host (`resolveCanvasFillColor`); bare `currentColor` is not valid as a canvas fill.
- **Clear is deferred one frame** after `AddStrokeCommand` so the new SVG mount can appear before the overlay clears — avoids a one-frame blank tip.
- **Reload the plugin** after changing `draw-tool`, `live-stroke-canvas`, or `ink-svg-canvas`; the live canvas is updated imperatively and will not reflect code changes until Obsidian reloads the plugin build.
- **Capture-time point merge** — hybrid append/replace-tip while drawing; see [ink-canvas-point-merge.md](ink-canvas-point-merge.md).
- **Pointer samples** — coalesced expansion in `pointer-samples.ts` is **off** (`USE_COALESCED_POINTER_SAMPLES = false`); one sample per `pointermove`. Re-enabling exposes raw digitizer positional jitter that the faithful outline traces into self-intersecting notches; see [ink-canvas-stroke-artifacts.md](ink-canvas-stroke-artifacts.md).
- **"xor-fill" outline notches** — caused by outline self-intersection (pressure→radius bowtie, fixed by `PEN_PRESSURE_SLEW_PER_SIZE`; or positional jitter from coalesced). Full causes, the shipped fix, and the approaches tried and **rejected** (distance gate, flat high streamline, backward-only reject, fill-rule, etc.) are documented in [ink-canvas-stroke-artifacts.md](ink-canvas-stroke-artifacts.md). **Do not re-add a forward distance gate** — it posterizes slow strokes and fixes neither cause.
