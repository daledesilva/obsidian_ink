# Ink colours and theming

## Why it exists

Ink strokes need to stay visible in light themes, dark themes, and when you print or share the raw SVG file. Those situations need different colours.

If the app only stored “whatever colour looked right on screen right now,” the file would look wrong when you switched theme, opened the SVG outside Obsidian, or printed it.

Ink splits the problem in two: **colours baked into the saved file**, and **colours applied when the app displays the file**.

## Conceptual understanding

### Saved file colours

When Ink saves an SVG, pen strokes are written as **black** (`#000000`). Writing guide lines are written as **medium gray** (`#888888`).

Those values are fixed in the file on purpose. Black ink on a white page is what you expect on paper. The file stays readable even if Obsidian is not installed.

The SVG also carries small class names on strokes and lines so the app knows which shapes are pen ink and which are guide lines.

### Display colours

When Ink **shows** an embed inside Obsidian, it does not rely on the baked black and gray alone. It loads the SVG into the page as real SVG markup (not a flat image tag) and applies CSS that points at Obsidian’s theme variables.

- **Pen strokes** use `--text-normal` — the same colour as body text in the current theme.
- **Writing guide lines** use `--color-base-50` — a soft line colour that fits the theme.
- **Optional writing background and drawing frame** use other theme surface colours when those settings are on.

When you toggle light or dark mode, those variables change. The embed updates without resaving the SVG.

```mermaid
flowchart LR
    Save["Save to vault"]
    Baked["File: black strokes, gray lines"]
    Show["Show in Obsidian"]
    Theme["CSS reads theme variables"]
    Screen["Screen matches current theme"]
    Save --> Baked
    Show --> Theme --> Screen
    Baked -.->|"file unchanged"| Show
```

### Two layers, one file

| Layer | Where it lives | Purpose |
|-------|----------------|---------|
| Baked colours | Inside the `.svg` file on disk | Print, export, fallback outside Obsidian |
| Theme colours | Ink preview CSS while viewing in Obsidian | Match light/dark and editor appearance |

The file on disk stays black and gray. The preview overrides those for display only.

## Flows

### Saving

1. You draw or write in the editor.
2. Ink exports paths and lines into the SVG.
3. Strokes get black fill and the stroke class.
4. Guide lines get gray stroke and the line class.
5. The file is written to your vault.

### Displaying in Live Preview or Reading mode

1. Ink loads the SVG into the preview area as inline SVG.
2. Theme CSS sets stroke and fill from Obsidian variables.
3. Guide lines pick up the writing-line colour; pen paths pick up text colour.
4. You change theme → variables change → preview colours change immediately.

### Displaying outside Ink’s preview

If something shows the SVG as a normal image (or you open the raw file in a browser), you see the **baked** black and gray. That is expected. Theme colours only apply when Ink’s preview CSS is active.

## Technical details

| Element | Baked in file | On screen in Ink preview |
|---------|---------------|--------------------------|
| Pen strokes | `#000000` | `var(--text-normal)` |
| Writing guide lines | `#888888` | `var(--color-base-50)` |
| Writing background (optional setting) | — | `var(--color-base-05)` |
| Drawing frame (optional setting) | — | `var(--color-base-30)` |

Constants for baked values live in `src/default-content-colours.ts`. Shared preview theme rules live in `src/components/shared/ink-svg-preview-theme.scss`.

Ink must **inline** the SVG for theme CSS to reach individual paths and lines. A plain `<img src="file.svg">` tag treats the drawing as one bitmap-like object; inner paths cannot be restyled.

## Technical gotchas

1. **Image embeds do not theme** — Reading mode must use Ink’s preview (inlined SVG), not Obsidian’s default image tag, or strokes stay black in dark mode.
2. **Baked black wins without CSS** — SVG `fill="#000000"` on a path is strong. Preview CSS uses `!important` so theme colour can override it inside Ink previews.
3. **Editor vs file** — While editing, the canvas may still use live drawing colours. Only the **exported SVG** and **locked previews** follow the bake + theme rules described here.
4. **Legacy files** — Older tldraw-era SVGs may use different stored colours. New ink-canvas exports follow black strokes and gray guide lines.
5. **Print and share** — Exported files intentionally stay black/gray so hard copies stay legible.

## See also

- [Reading mode](reading-mode.md) — How Reading mode loads and shows embed previews
- [Reading mode embed rendering](reading-mode-embed-rendering.md) — Reading mode implementation
- [Plugin memory and persistence](plugin-memory-and-persistence.md) — What lives in vault files vs settings
