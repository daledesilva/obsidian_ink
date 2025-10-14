import { TLEditorSnapshot } from 'tldraw';

export type BrushStyles = {
    color: string;
    size: string;
};

export type InkFileMetadata_v1 = {
    pluginVersion: string;
    tldrawVersion: string;
    previewIsOutdated?: boolean;
    transcript?: string;
    brushStyles?: BrushStyles;
};

export type InkFileData_v1 = {
    meta: InkFileMetadata_v1;
    tldraw: TLEditorSnapshot;
    previewUri?: string;
};


