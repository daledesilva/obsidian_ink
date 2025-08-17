import { TLEditorSnapshot } from '@tldraw/tldraw';

export type InkFileMetadata = {
    pluginVersion: string;
    fileType: 'writing' | 'drawing';
    tldrawVersion: string;
    previewIsOutdated?: boolean;
    transcript?: string;
};

export type InkFileData = {
    meta: InkFileMetadata;
    tldraw: TLEditorSnapshot;
    svgString: string;
};


