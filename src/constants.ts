const manifest = require('../manifest.json');

////////
////////

export const PLUGIN_VERSION = manifest.version;
export const TLDRAW_VERSION = '2.0.0-alpha.17';
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