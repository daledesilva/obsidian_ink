import { TLEditorSnapshot } from '@tldraw/tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const emptyDrawingSvgStr: string = require('src/defaults/empty-drawing-embed.svg');

///////
///////

type Metadata = {
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

export type InkFileData_v2 = {
    meta: Metadata;
    tldraw: TLEditorSnapshot;
    svgString: string;
};

// Primary functions
///////

export const buildWritingFileData = (props: {
	tlEditorSnapshot: TLEditorSnapshot,
	previewIsOutdated?: boolean;
	transcript?: string;
	previewUri?: string,
}): InkFileData => {

	return buildFileData(props);
}

export const buildDrawingFileData = (props: {
	tlEditorSnapshot: TLEditorSnapshot,
	previewIsOutdated?: boolean;
	previewUri?: string,
}): InkFileData => {

	return buildFileData(props);
}

export const buildDrawingFileData_v2 = (props: {
    tlEditorSnapshot: TLEditorSnapshot,
    previewIsOutdated?: boolean;
    svgString?: string,
}): InkFileData_v2 => {

    const { tlEditorSnapshot, previewIsOutdated, svgString } = props;

    return buildFileData_v2({
        tlEditorSnapshot,
        previewIsOutdated,
        svgString,
    });
}

export const buildFileData_v2 = (props: {
    tlEditorSnapshot: TLEditorSnapshot,
    previewIsOutdated?: boolean;
    transcript?: string;
    svgString?: string,
}): InkFileData_v2 => {

    const {
        tlEditorSnapshot,
        svgString,
        previewIsOutdated = false,
    } = props;

    let pageData: InkFileData_v2 = {
        meta: {
            pluginVersion: PLUGIN_VERSION,
            tldrawVersion: TLDRAW_VERSION,
        },
        tldraw: tlEditorSnapshot,
        // Always set svgString to either provided svg or default empty svg
        svgString: svgString || emptyDrawingSvgStr,
    }

    if (previewIsOutdated) pageData.meta.previewIsOutdated = previewIsOutdated;

    return pageData;
}

const buildFileData = (props: {
	tlEditorSnapshot: TLEditorSnapshot,
	previewIsOutdated?: boolean;
	transcript?: string;
	previewUri?: string,
}): InkFileData => {

	const {
		tlEditorSnapshot: tlEditorSnapshot,
		previewUri,
		previewIsOutdated = false,
	} = props;

	let pageData: InkFileData = {
		meta: {
			pluginVersion: PLUGIN_VERSION,
			tldrawVersion: TLDRAW_VERSION,
		},
		tldraw: tlEditorSnapshot,
	}

	if (previewIsOutdated) pageData.meta.previewIsOutdated = previewIsOutdated;
	if (previewUri) pageData.previewUri = previewUri;

	return pageData;
};

