const manifest = require('../manifest.json');

////////
////////

export const PLUGIN_VERSION = manifest.version;
export const TLDRAW_VERSION = '2.1.0';
export const LOCAL_STORAGE_PREFIX = 'ddc_ink_';
export const PLUGIN_KEY = 'ddc_ink';
export const ATTACHMENT_SUBFOLDER_NAME = 'Ink';
export const WRITING_SUBFOLDER_NAME = 'Writing';
export const DRAWING_SUBFOLDER_NAME = 'Drawing';
export const WRITE_FILE_EXT = 'writing';
export const DRAW_FILE_EXT = 'drawing';
export const WRITE_EMBED_KEY = 'handwritten-ink';
export const DRAW_EMBED_KEY = 'handdrawn-ink';
export const MENUBAR_HEIGHT_PX = 100;

export const WRITE_SHORT_DELAY_MS = 500;
export const WRITE_LONG_DELAY_MS = 2000;
export const WRITE_STROKE_LIMIT = 200;

export const DRAW_SHORT_DELAY_MS = 500;
export const DRAW_LONG_DELAY_MS = 2000;
export const DRAW_STROKE_LIMIT = 200;

export const WRITING_PAGE_WIDTH = 2000;
export const WRITING_LINE_HEIGHT = 150;
export const WRITING_MIN_PAGE_HEIGHT = WRITING_LINE_HEIGHT * 1.5;

// export const DRAWING_INITIAL_CANVAS_WIDTH = 4000;
export const DRAWING_INITIAL_WIDTH = 500;   // 750 // HACK: This sizing is a guestimation. It won't work for all themes.
export const DRAWING_INITIAL_ASPECT_RATIO = 1;
export const DRAWING_INITIAL_HEIGHT = Math.round(DRAWING_INITIAL_WIDTH * DRAWING_INITIAL_ASPECT_RATIO);