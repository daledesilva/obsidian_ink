# Boox companion app integration (Obsidian Ink)

> **Cross-component documentation** for how Obsidian Ink and eInk Bridge work together lives in the **eink-bridge** repo, not here:
>
> - **[Obsidian Ink surfaces and eInk Bridge](../../eink-bridge/docs/implementations/obsidian-ink-surfaces-and-boox.md)** — writing/drawing embeds and dedicated views, session stack, leaf visibility, writing resize queue
> - **[Obsidian Ink drawing embed integration (protocol)](../../eink-bridge/docs/implementations/obsidian-ink-embed-integration.md)** — WebSocket messages and Bridge behaviour
> - **[Overlay corner alignment markers](../../eink-bridge/docs/implementations/overlay-corner-alignment-markers.md)** — `cornerMarkers` on drawing-area payloads (embed radius, dedicated square corners, drawing embed hides bottom-right)
> - **[Single active embed constraint](../../eink-bridge/docs/implementations/single-active-embed-constraint.md)** — one unlocked embed when Boox is enabled

For **USB debugging and correlated logs**, see [Debugging on device](debugging-on-device.md) (plugin) and [Debugging eInk Bridge on device](../../eink-bridge/docs/debugging-on-device.md) (native app).

Plugin implementation entry point: `src/connections/boox/boox-connection.ts`.

## Plugin-side overlay marker payloads

Drawing and writing editors call `buildBooxCornerMarkers()` (`src/connections/boox/boox-corner-markers.ts`) when sending `new-drawing-area` / `update-drawing-area`:

| Surface | Payload |
|---|---|
| Embed | `{ radius: <computed embed border-radius> }`; drawing embed also sets `bottomRight: false` (resize handle) |
| Writing embed (temporary) | Also sets `width: 6` on `cornerMarkers` for Boox marker visibility testing |
| Dedicated view | `{ radius: 0 }` only — square chrome; crop flags use Bridge defaults |

Embed border radius is applied in CSS on `.ddc_ink_resize-container--boox` only (`ink-boox-eink-chrome.scss`), not on dedicated Boox editors.

## Boox writing-embed toolbar visibility

Embedded writing editors position the primary menu bar **above** the canvas using `transform: translate(0, -100%)` when active (`primary-menu-bar.scss`). Boox high-contrast chrome applies `overflow: hidden` on `.ddc_ink_boox-eink .ddc_ink_writing-editor` so rounded embed outlines clip cleanly.

That combination **clips the translated menu** unless the embed overrides overflow. Drawing embeds already set `overflow: visible` on the editor root; writing embeds match that in `writing-editor.scss`:

```scss
.ddc_ink_embed .ddc_ink_writing-editor.ddc_ink_boox-eink {
	overflow: visible;
}
```

Without this override, the toolbar remains in the DOM (and in `excludeRects`) but is not visible on Boox tablets. Changing Bridge `cornerMarkers.width` does not affect Obsidian toolbar layout.
