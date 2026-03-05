# UX Decisions

## Ink options in overflow menus (not Obsidian pane menu)

**Why it exists:** Ink-specific actions (convert between drawing/writing, grid toggle, copy embed, etc.) are surfaced in the overflow (⋯) button inside the ink canvas/view, rather than in Obsidian’s generic “more options” pane header menu. This keeps ink-related options grouped, discoverable, and consistent whether the file is open as a full-page view or viewed as an embed.

**Intended behaviour:** All actions that apply specifically to an ink file are available from the overflow menu on the ink view itself. Obsidian’s pane menu (three-dot button on the tab) is left for system-level items (open in default app, pin tab, etc.), not ink-specific ones.

**Technical note:** Implemented in `ExtendedDrawingMenu` / `ExtendedWritingMenu`, fed by `getExtendedOptions` (drawings) or an `extendedMenu` prop (writings).
