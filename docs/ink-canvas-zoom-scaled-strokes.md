# Ink canvas: zoom-scaled stroke smoothing

## Why it exists

Stroke capture and outline generation run in **page space** (canvas coordinates inside the SVG `<g>` transform). Users judge strokes in **screen space** (pixels on the display). When the camera is zoomed in, the same on-screen pen motion produces **denser page-space samples** and the same numeric `streamline` / `smoothing` values cut corners more aggressively than at 1× zoom — committed strokes can look “smoothed beyond recognition” right after lift even though live preview looked correct.

Presets in `stroke-presets.ts` (pen `streamline: 0.5`, mouse `0.65`, etc.) were tuned at **reference zoom 1**. Zoom scaling adjusts commit-time smoothing and duplicate-point merging so behaviour stays roughly **consistent in screen space** across zoom levels.

Related: [ink-canvas-live-drawing.md](ink-canvas-live-drawing.md) (live vs committed pipelines). Plan context: `plans/stroke-smoothing/` (merge threshold already used `1 / camera.zoom` for capture; this doc covers commit-time scaling).

---

## Conceptual understanding

### Page space vs screen space

From [pan-zoom.md](pan-zoom.md), viewport coordinates relate to page coordinates via camera `zoom` (`z`):

$$\text{pageDelta} \approx \frac{\text{screenDelta}}{\text{zoom}}$$

So at **higher zoom**, a 1 px on-screen move is a **smaller** step in page space → more points per inch of screen travel after merge, and streamline lerps between **closer** page-space knots → stronger apparent smoothing.

### Reference zoom

All scaling uses **`INK_STROKE_ZOOM_REFERENCE = 1`** (`src/ink-canvas/stroke-zoom-scale.ts`). At zoom 1, multipliers are identity. Above 1, smoothing and merge radii **shrink** in page space.

### What is scaled (and what is not)

| Mechanism | Scaled with capture zoom? | When applied |
|-----------|---------------------------|--------------|
| **Live preview** (`getStroke`, `streamline: 0`) | No | While pen is down |
| **`streamline` / `smoothing` on saved `stroke.style`** | Yes — baked at capture | Pointer down/up → persisted on stroke |
| **`mergeNearDuplicatePoints`** in `getInkStrokePoints` | Yes — via `captureZoom` on outline options | Commit outline + re-render/export |
| **Capture merge** (`appendOrMergePoint`, `1 / zoom` page threshold) | Yes — uses **current** camera each move | While capturing into `points` |

Live preview intentionally does **not** use these scalers; only **committed** local strokes do.

```mermaid
flowchart TD
  subgraph capture [At stroke capture]
    Z[camera.zoom at down/up]
    Z --> Style[buildInkStrokeStyleForTreatAs]
    Style --> Baked["style.streamline, style.smoothing, style.captureZoom"]
    Z --> MergeCap["points merge threshold 1/zoom page"]
  end
  subgraph commit [On commit / re-render]
    Baked --> PF[perfect-freehand options]
    Baked --> Dup[mergeNearDuplicatePoints radius]
    Points[stroke.points] --> Outline[getInkStrokeOutline]
    PF --> Outline
    Dup --> Outline
  end
  subgraph live [While drawing]
    LivePts[livePreviewPoints] --> LiveStroke["getStroke streamline 0"]
  end
```

---

## Flows

### When values are recorded

```mermaid
sequenceDiagram
  participant Cam as camera.zoom
  participant Draw as draw-tool
  participant Style as stroke.style

  Cam->>Draw: pointerdown
  Draw->>Style: buildInkStrokeStyleForTreatAs(base, treatAs, zoom)
  Note over Style: streamline/smoothing scaled, captureZoom stored

  loop pointermove
    Draw->>Draw: merge points at 1/zoom page threshold
  end

  Cam->>Draw: pointerup
  Draw->>Style: rebuild style with final zoom
  Draw->>Draw: AddStrokeCommand(points, style)
```

`captureZoom` is stored on the stroke so **re-open, export, and zooming the canvas later** still use the zoom at which the stroke was drawn — not the current view zoom.

### Outline pipeline on commit

```mermaid
flowchart LR
  P[stroke.points] --> GIP[getInkStrokePoints]
  Opt[toStrokeOptions style] --> GIP
  GIP --> Merge[mergeNearDuplicatePoints]
  GIP --> Stream[streamline lerp]
  GIP --> Out[getStrokeOutlinePoints]
  Out --> SVG[StrokePath d attribute]
```

`toStrokeOptions` passes `captureZoom` into `InkStrokeOutlineOptions` for duplicate merging only; `streamline` and `smoothing` are already the scaled numbers on `style`.

---

## Technical details

### Two-branch formula (`metricForCaptureZoom`)

Constants: `zoomRef = 1`, `zoomMin = 0.1` (camera `MIN_ZOOM`). Preset `P` is the **1× reference** in `stroke-presets.ts`. Zoom-out target `T_out` depends on input kind (`STREAMLINE_SMOOTHING_ZOOM_OUT_TARGET`).

$$\text{lerpT}(z) = \frac{1/z - 1}{1/z_\text{min} - 1}$$

| Direction | Condition | Effective value |
|-----------|-----------|-----------------|
| **Reference** | `z = 1` | `P` |
| **Zoom out** | `z_min ≤ z < 1` | `P + \text{lerpT}(z)\,(T_\text{out} - P)` |
| **Zoom in** | `z ≥ 1` | `P \times (zoomRef / z)` |

Then `clamp` to `[0, 1]` for streamline/smoothing. **Never use `P/z` when `z < 1`** (that would push values above 1).

| Input | `P` @ 1× (`stroke-presets.ts`) | `T_out` @ 0.1× (`STREAMLINE_SMOOTHING_ZOOM_OUT_TARGET`) |
|--------|-------------------------------|------------------------------------------------------|
| Pen | 0.10 / 0.10 | 0.20 |
| Mouse | 0.20 / 0.20 | 0.40 |

`P` is the **real** 1× tuning. Mouse uses +0.2 on zoom-out; pen uses the same curve at half magnitude.

| Zoom | Pen | Mouse |
|------|-----|-------|
| 0.1× | 0.20 | 0.40 |
| 0.5× | ~0.11 | ~0.22 |
| 1× | 0.10 | 0.20 |
| 2× | 0.05 | 0.10 |
| 5× | 0.02 | 0.04 |

`thinning`, brush `size`, and colour are **not** zoom-scaled.

### mergeNearDuplicatePoints

Same curve with `P = size/3` at 1× and `T_out = (size/3) × (zoomRef/zoomMin)` at 0.1× (wider merge in page space when zoomed out). Threshold is distance squared.

### Capture-time point merge (draw-tool)

Separate from duplicate merge above: while drawing, `appendOrMergePoint` uses:

$$\text{mergeThresholdPage} = \frac{1}{\text{camera.zoom}}$$

(~1 screen pixel in page units). Documented in Plan 2; unchanged by `stroke-zoom-scale.ts` but solves the same page-vs-screen mismatch during capture.

### Code map

| Responsibility | File |
|----------------|------|
| Scale helpers, `INK_STROKE_ZOOM_REFERENCE` | `src/ink-canvas/stroke-zoom-scale.ts` |
| Apply to presets + set `captureZoom` | `src/ink-canvas/stroke-presets.ts` |
| Read `captureZoom` in outline options | `src/ink-canvas/types.ts` (`InkStrokeStyle`, `toStrokeOptions`) |
| Duplicate merge uses threshold | `src/ink-canvas/freehand/get-ink-stroke-points.ts` |
| Pass zoom at down/up | `src/ink-canvas/tools/draw-tool.ts` |
| Boox ingest style | `tldraw-drawing-editor.tsx`, `tldraw-writing-editor.tsx` |

---

## Technical Gotchas

- **Legacy strokes** without `captureZoom` default to **1** in `toStrokeOptions` — behaviour matches pre-scaling commits.
- **Do not scale at render time from current camera** — stroke shape would change when the user zooms the editor after drawing. Values are fixed at **capture** zoom.
- **Live vs commit** — zoom scaling does not affect live preview; a small difference on lift can remain if commit still uses `getInkStrokeOutline` vs live `getStroke` with `streamline: 0`.
- **Mid-stroke zoom** — style is rebuilt on **pointer up** with final `camera.zoom`; zoom changes during a stroke are rare but use lift-time zoom for stored scalars.
- **Boox strokes** (`authoringSource: 'boox'`) render with `getStroke` and skip `getInkStrokePoints`; `captureZoom` may still be stored on style for consistency but duplicate-merge scaling does not apply to that path.
- **Tuning** — change pen/mouse presets at reference zoom 1; adjust `INK_STROKE_ZOOM_REFERENCE` or the formula in `stroke-zoom-scale.ts` only if the global curve needs changing, not per-device in this layer.
- **Zoomed out still feels soft** — check pen `T_out` (0.4) vs live vs commit pipeline; mouse stays at 0.65 for `z ≤ 1` when reference presets match `T_out`.
