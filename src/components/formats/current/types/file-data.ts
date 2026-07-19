import { TLEditorSnapshot } from '@tldraw/tldraw';
import type { InkCanvasSnapshot } from 'src/ink-canvas/types';

///////////////////////////
///////////////////////////

export type InkFileMetadata = {
    pluginVersion: string;
    fileType: "inkDrawing" | "inkWriting";
    tldrawVersion: string;
    previewIsOutdated?: boolean;
    transcript?: string;
    /** Height in pixels of each ruled line. Stored per-file so existing embeds are unaffected by the global setting. */
    writingLineHeight?: number;
};

export type InkFileData = {
    meta: InkFileMetadata;
    tldraw: TLEditorSnapshot;
    /** Present when file uses `<ink-canvas version="…">` metadata (see `isInkCanvasFile`). */
    inkCanvas?: InkCanvasSnapshot;
    svgString: string;
};


