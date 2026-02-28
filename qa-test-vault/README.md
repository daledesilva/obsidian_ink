# QA Test Vault for obsidian_ink

Self-contained vault for visual regression testing. Contains dummy markdown notes, sample ink embeds (SVG v2 and legacy v1 formats), and compatibility tests for Obsidian plugins.

## Quick Start

1. Run `node qa-test-vault/generate.mjs` from the obsidian_ink project root to create/reset the vault.
2. Open the `qa-test-vault` folder as an Obsidian vault.
3. Install and enable the Ink plugin (symlink or copy from main project).
4. Walk through numbered sections (01–11) following instructions in each note.

## Reset

`node qa-test-vault/generate.mjs` rebuilds the entire vault from scratch. Run after code changes to retest.

## Structure

- **01 – Basic Embeds**: Single, multiple, mixed, empty
- **02 – Legacy Format**: v1 code block embeds (handwritten-ink, handdrawn-ink)
- **03 – Density and Repetition**: Many embeds, same embed repeated, back-to-back
- **04 – Obsidian Native Features**: Block quotes, lists, tables, transclusion, headings, code blocks
- **04b – Callouts and Layout**: Native callouts, Admonition, List Callouts, Columns (Multi-Column, Obsidian Columns, MCL)
- **05 – Settings Variations**: writingLinesWhenLocked, drawingFrameWhenLocked, etc.
- **06 – Sizing and Aspect Ratios**: Width range (100–1000px), aspect ratios, writing length
- **07 – Theme and Layout**: Readable width, full width, dark/light mode
- **08 – Plugin Compatibility**: Kanban, Tabs, Slides, Tasks, Excalidraw, export
- **08b – Insertion Plugins**: Templater, QuickAdd, Buttons, Core Templates
- **08c – Make.md and Dataview**: Flow view, board, database, queries
- **08d – Dashboards**: Grid embeds, Dashboard++ MOC
- **08e – Canvas**: Note cards, canvas embed in note, grouped cards
- **09 – Edge Cases**: Missing file, broken syntax, source/reading mode
- **10 – Cross-Reference**: Transclusion, same file across notes
- **11 – CodeMirror**: Cursor nav, split pane, undo, paste, search, print
- **12 – File Conversion**: Writing/drawing convert via pane menu (real fixture SVGs)
- **13 – Migration Test**: Legacy v1 code block embeds for migration testing
- **14 – Conversion Modal**: Multi-note embed scan and conversion modal tests
