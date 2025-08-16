import { TLEditorSnapshot } from '@tldraw/tldraw';

export type Metadata = {
    pluginVersion: string;
    tldrawVersion: string;
    previewIsOutdated?: boolean;
    transcript?: string;
};

export type InkFileData = {
    meta: Metadata;
    tldraw: TLEditorSnapshot;
    previewUri?: string;
};


