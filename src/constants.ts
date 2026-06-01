import manifest from '../manifest.json';

////////
////////

export const PLUGIN_VERSION = manifest.version;
export const TLDRAW_VERSION = '2.4.3';
/**
 * Semver version written to `<ink-canvas version="…">` in SVG metadata.
 *
 * Describes the **functionality and structure** of the ink-canvas format — a custom
 * ink file payload used by this plugin (not the tldraw library version).
 *
 * - **Major** — breaking format changes (loaders may reject or require migration).
 * - **Minor** — non-breaking format changes (older readers can still load the file).
 * - **Patch** — tweaks, bug fixes, and development iterations (same compatibility band).
 *
 * @see obsidian_ink/docs/file-format-and-conversion.md — “Ink-canvas format version”
 */
export const INK_CANVAS_FORMAT_VERSION = '0.5.0';
// Base URL used when creating v2 embed links
export const INK_EMBED_BASE_URL = 'https://youtu.be/2arL1jh8ihA';
export const LOCAL_STORAGE_PREFIX = 'ddc_ink_';
export const PLUGIN_KEY = 'ddc_ink';
export const ATTACHMENT_SUBFOLDER_NAME = 'Ink';
export const WRITING_SUBFOLDER_NAME = 'Writing';
export const DRAWING_SUBFOLDER_NAME = 'Drawing';
export const WRITE_FILE_V1_EXT = 'writing';
export const DRAW_FILE_V1_EXT = 'drawing';
export const WRITE_EMBED_KEY = 'handwritten-ink';
export const DRAW_EMBED_KEY = 'handdrawn-ink';
export const MENUBAR_HEIGHT_PX = 100;

export const WRITE_SHORT_DELAY_MS = 500;
export const WRITE_LONG_DELAY_MS = 2000;

export const DRAW_SHORT_DELAY_MS = 500;
export const DRAW_LONG_DELAY_MS = 2000;

export const WRITING_PAGE_WIDTH = 2000;
export const WRITING_LINE_HEIGHT = 150;
export const WRITING_MIN_PAGE_HEIGHT = WRITING_LINE_HEIGHT * 2.5;

// export const DRAWING_INITIAL_CANVAS_WIDTH = 4000;
export const DRAWING_INITIAL_WIDTH = 500;   // 750 // HACK: This sizing is a guestimation. It won't work for all themes.
export const DRAWING_INITIAL_ASPECT_RATIO = 1;
export const DRAWING_INITIAL_HEIGHT = Math.round(DRAWING_INITIAL_WIDTH * DRAWING_INITIAL_ASPECT_RATIO);