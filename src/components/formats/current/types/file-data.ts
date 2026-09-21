import { TLEditorSnapshot } from '@tldraw/tldraw';
import type { InkCanvasSnapshot } from 'src/ink-canvas/types';

///////////////////////////
///////////////////////////

export type InkFileMetadata = {
    pluginVersion: string;
    fileType: "inkDrawing" | "inkWriting";
    tldrawVersion: string;
    previewIsOutdated?: boolean;
    /** Handwriting transcript (markdown) stored in SVG `<metadata><transcript>…</transcript>`. */
    transcript?: string;
    /**
     * SimHash of stroke geometry at last successful transcription (`v1:simhash64:…`).
     * Compared with Hamming distance; not a hash of the transcript text.
     */
    svgContentHash?: string;
    /** ISO-8601 time when svgContentHash was written (debug / retry policy; not for similarity). */
    svgContentHashedAt?: string;
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


