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
    /**
     * Which rendering engine produced this file's editor data.
     * - `'tldraw'` (or `undefined` for backward compat): uses `tldraw` field.
     * - `'ink-canvas'`: uses `inkCanvas` field.
     */
    format?: 'tldraw' | 'ink-canvas';
};

export type InkFileData = {
    meta: InkFileMetadata;
    tldraw: TLEditorSnapshot;
    /** Present when `meta.format === 'ink-canvas'`. */
    inkCanvas?: InkCanvasSnapshot;
    svgString: string;
};


