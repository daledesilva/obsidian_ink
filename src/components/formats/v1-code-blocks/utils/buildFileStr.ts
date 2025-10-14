import { TLEditorSnapshot } from 'tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';
import { DOMParser } from 'xmldom';
import format from 'xml-formatter';

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