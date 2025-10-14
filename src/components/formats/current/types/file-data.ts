import { TLEditorSnapshot } from 'tldraw';

export type BrushStyles = {
    color: string;
    size: string;
};

export type InkFileMetadata = {
    pluginVersion: string;
    fileType: "inkDrawing" | "inkWriting";
    tldrawVersion: string;
    previewIsOutdated?: boolean;
    transcript?: string;
    brushStyles?: BrushStyles;
};

export type InkFileData = {
    meta: InkFileMetadata;
    tldraw: TLEditorSnapshot;
    svgString: string;
};


