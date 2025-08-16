import { TLEditorSnapshot } from '@tldraw/tldraw';

export type Metadata = {
    pluginVersion: string;
    tldrawVersion: string;
    previewIsOutdated?: boolean;
    transcript?: string;
};

export type InkFileData_v2 = {
    meta: Metadata;
    tldraw: TLEditorSnapshot;
    svgString: string;
};


