import { TLEditorSnapshot } from '@tldraw/tldraw';

export enum InkFileType {
    Writing = 'writing',
    Drawing = 'drawing',
}

export type InkFileMetadata = {
    pluginVersion: string;
    fileType: InkFileType;
    tldrawVersion: string;
    previewIsOutdated?: boolean;
    transcript?: string;
};

export type InkFileData = {
    meta: InkFileMetadata;
    tldraw: TLEditorSnapshot;
    svgString: string;
};


