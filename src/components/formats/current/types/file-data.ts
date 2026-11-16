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
    /** Sorted unique bbox-relative 32px occupancy cells at last successful transcription. */
    bboxCellsAtLastTranscription?: string;
    /** ISO-8601 time when bboxCellsAtLastTranscription was written. */
    lastTranscriptionAt?: string;
    /** Height in pixels of each ruled line. Stored per-file so existing embeds are unaffected by the global setting. */
    writingLineHeight?: number;
    /** Relative vault path to a source photo (e.g. `Images/note.jpg`) for photo-imported writing. */
    sourceImage?: string;
    /**
     * Older imports stored a straightened page JPEG here for transcription.
     * New imports omit it and transcribe `sourceImage` instead.
     */
    transcriptImage?: string;
    /** When `photo`, transcription reads the source JPEG until the user edits strokes. */
    transcriptFrom?: 'photo';
};

export type InkFileData = {
    meta: InkFileMetadata;
    tldraw: TLEditorSnapshot;
    /** Present when file uses `<ink-canvas version="…">` metadata (see `isInkCanvasFile`). */
    inkCanvas?: InkCanvasSnapshot;
    svgString: string;
};


