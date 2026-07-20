import { TLEditorSnapshot } from '@tldraw/tldraw';

type Metadata_v1 = {
	pluginVersion: string;
	tldrawVersion: string;
	previewIsOutdated?: boolean;
	transcript?: string;
};

type InkFileData_v1 = {
	meta: Metadata_v1;
	tldraw: TLEditorSnapshot;
    previewUri?: string;
    svgString?: string;
};

// V1 format: Plain JSON string
export const buildFileStr_v1 = (pageData: InkFileData_v1): string => {
    return JSON.stringify(pageData, null, '\t');
}