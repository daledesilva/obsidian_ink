import { TLEditorSnapshot } from '@tldraw/tldraw';

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
    svgString: string;
};


