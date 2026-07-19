import { TLEditorSnapshot } from '@tldraw/tldraw';

export type InkFileMetadata_v1 = {
    pluginVersion: string;
    tldrawVersion: string;
    previewIsOutdated?: boolean;
    transcript?: string;
};

export type InkFileData_v1 = {
    meta: InkFileMetadata_v1;
    tldraw: TLEditorSnapshot;
    previewUri?: string;
};


