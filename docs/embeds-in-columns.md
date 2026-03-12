# Embeds in Columns

## Why it exists

Users frequently place Ink embeds (writing and drawing) inside column layouts — e.g. a two-column page with notes on the left and sketches on the right. They then find they cannot edit those embeds in place. This document explains the cause and offers workarounds.

## What works

- **Inserting embeds into columns** — You can add ink embeds inside column markup using any of the common column plugins:
  - Obsidian Columns (`> [!col]` / `> [!col-md]`)
  - Multi-Column Markdown (code fence syntax)
  - Modular CSS Layout (MCL) (`> [!multi-column]` or `#mcl/list-grid` list syntax)
- **Display** — When the note is in Reading mode or Live Preview and you are not editing the column area, embeds render correctly and show the preview image.

## What does not work

- **Editing embeds inside column markup** — When you focus on editing the region that contains the column layout, Obsidian collapses the column structure back to raw Markdown. The CodeMirror widget pipeline expects parsed markdown with specific node structure; in that collapsed state, the embed widgets do not mount. You see the raw syntax (`![InkWriting](<path>) [Edit Writing](...)`) instead of the interactive canvas.

## Why this happens

Column layouts in Obsidian are implemented by community plugins or CSS snippets. They operate on the **rendered** output of Live Preview. When you click into the area to edit, Obsidian switches to a source representation of that block — the column markup is shown as plain markdown, and our embed extensions no longer see the structure they need to replace with widgets.

## Workarounds

1. **Edit outside the column** — Place the cursor in a non-column section of the note (e.g. a heading or paragraph above or below the columns). The embeds in columns will display as previews. To edit one, temporarily move the embed out of the column, edit it, then move it back.
2. **Open the ink file directly** — Use the "Edit" link to open the ink file in its own tab. You can edit the drawing or writing there; changes persist and will appear in the embed when you return to the note.
3. **Use Locate file** — If the embed shows a "file not found" or similar state, the Locate action can help you fix the path. The embed will still not be editable in place inside the column, but the preview will display correctly once the path is resolved.

## Technical details

- Column plugins (Obsidian Columns, Multi-Column Markdown, MCL) rely on Live Preview’s rendered DOM. When the editor focuses on editing that region, Obsidian may present the content as raw markdown.
- Ink embed extensions are CodeMirror widget extensions that replace specific markdown link syntax with React components. They run in Live Preview only; in Source mode or when the column collapses to markdown, `Decoration.none` is effectively the result, so no widgets appear.

## See also

- [Ink embeds: contexts and limitations](ink-embeds-contexts-and-limitations.md) — Overview of all supported and unsupported contexts.
- [plan-columns-e2e-tests](../.github/plans/plan-columns-e2e-tests.md) — E2E test setup for column layouts.
