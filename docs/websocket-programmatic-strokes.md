# Programmatic Pen Strokes via WebSocket

This document describes how pen strokes are created programmatically when drawing input comes from the Boox companion app (eInk Bridge) over a WebSocket on the **same device** as Obsidian, rather than from direct pointer events on the tldraw canvas. For **loopback ports, handshake, and full WebSocket message protocol**, see **`eink-bridge/docs/`** (e.g. [WebSocket security](../../eink-bridge/docs/implementations/websocket-security.md)) in this repo.

## Overview

When the Boox WebSocket is connected, the device sends stroke point data over the wire. The plugin receives these points, converts them into tldraw’s coordinate system, and creates draw shapes via the editor API. To avoid duplicate strokes, tldraw is put into readonly mode so it ignores local pointer/pen input; only the WebSocket path creates strokes.

## Data Flow

```mermaid
sequenceDiagram
	participant Device as Boox device
	participant WS as WebSocket server
	participant Plugin as Obsidian plugin
	participant Tldraw as tldraw editor

	Device->>WS: stroke points (x, y, pressure, ...)
	WS->>Plugin: ws.onmessage(message.data)
	Plugin->>Plugin: createStrokeFromBoox(canvasRelativePoints)
	Plugin->>Plugin: map to tldraw coords, set z = pressure
	Plugin->>Plugin: createTldrawStroke(tldrawPoints)
	Plugin->>Plugin: bypassReadonly(editor, () => createShape(...))
	Tldraw->>Tldraw: draw shape with isPen: true, segments
```

1. **WebSocket message**  
   The connection is managed by `BooxConnection` in `src/connections/boox/boox-connection.ts` (WebSocket is open only while a drawing is being edited / unlocked; parallel probe of loopback ports with an `ink-bridge-ping` / `ink-bridge-pong` handshake, plus an enable flag in plugin settings). Incoming `new-stroke` messages are routed to the active drawing editor’s stroke handler.

2. **Callback**  
   The drawing editor registers `createStrokeFromBoox` via `registerDrawingSession` (see `tldraw-drawing-editor.tsx`). So each WebSocket payload is a single stroke’s worth of points.

3. **Coordinate conversion**  
   `createStrokeFromBoox` receives points in **canvas-relative** coordinates (relative to the embed/canvas element). It uses the editor’s viewport page bounds and the embed’s bounding rect to scale and translate into **tldraw page coordinates**, so strokes appear in the correct place on the canvas.

4. **Programmatic shape creation**  
   The converted points are passed to `createTldrawStroke`, which calls `editor.createShape()` with `type: 'draw'` and a single `free` segment. Because the editor is in readonly mode while the WebSocket is connected, the call is wrapped in `bypassReadonly()` so this programmatic creation is allowed.

## Stroke Point Properties from the WebSocket

The WebSocket sends points with at least the following properties (see `canvasRelativeStrokePoint` in `tldraw-drawing-editor.tsx`):

| Property   | Description |
|----------|-------------|
| `x`, `y`  | Position in canvas-relative coordinates. |
| `pressure` | Pen pressure, **pre-normalised to [0, 1]** by the sender. |
| `size`   | Reported size (e.g. nib size). Not yet passed into tldraw. |
| `tiltX`, `tiltY` | Tilt angles. Not yet passed into tldraw. |
| `timestamp` | Time of the point. Not yet passed into tldraw. |

Only a subset is currently used when building tldraw points:

- **Position:** `x`, `y` are transformed into tldraw page space (see above).
- **Pressure:** `pressure` is assigned to the point’s **`z`** value. In tldraw, `z` on draw segment points is used for pressure when **`isPen: true`** is set on the draw shape. So the pre-normalised [0, 1] pressure from the WebSocket is applied directly as `z` for variable stroke thickness.

Other fields (`size`, `tiltX`, `tiltY`, `timestamp`) are available in the interface but not yet mapped into the tldraw shape; they could be used in future for richer rendering or replay.

## Relevant Code

- **WebSocket connection and message dispatch:** `src/connections/boox/boox-connection.ts`  
  `InkPlugin.booxConnection` — `registerDrawingSession`, `ensureConnected`, and inbound JSON handling for `new-stroke`.

- **Stroke handling and coordinate conversion:** `src/components/formats/current/drawing/tldraw-drawing-editor/tldraw-drawing-editor.tsx`  
  `createStrokeFromBoox`, `createTldrawStroke`, and the `bypassReadonly` wrapper.

- **Readonly and bypass helpers:** `src/components/formats/current/utils/tldraw-helpers.ts`  
  `lockTldrawInput`, `unlockTldrawInput`, `bypassReadonly`.

When the WebSocket connects, the editor is locked with `lockTldrawInput` so only this programmatic path creates strokes; when it disconnects, `unlockTldrawInput` restores normal pointer input.
