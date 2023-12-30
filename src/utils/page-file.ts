import { StoreSnapshot } from '@tldraw/store';
import { TLRecord } from '@tldraw/tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';
import { isEmptyDrawingFile, isEmptyWritingFile } from './helpers';

///////
///////

type Metadata = {
	pluginVersion: string;
	tldrawVersion: string;
	previewIsOutdated?: boolean;
	previewIsDarkMode?: boolean;
	transcript?: string;
};

export type InkFileData = {
	meta: Metadata;
	tldraw: StoreSnapshot<TLRecord>;
	previewUri?: string;
};

// Primary functions
///////


export const buildWritingFileData = (props: {
	tldrawData: StoreSnapshot<TLRecord>,
	previewIsOutdated?: boolean;
	transcript?: string;
	previewUri?: string,
}): InkFileData => {
	
	return buildFileData(props);
}

export const buildDrawingFileData = (props: {
	tldrawData: StoreSnapshot<TLRecord>,
	previewIsOutdated?: boolean;
	previewUri?: string,
}): InkFileData => {

	return buildFileData(props);
}


const buildFileData = (props: {
	tldrawData: StoreSnapshot<TLRecord>,
	previewIsOutdated?: boolean;
	previewIsDarkMode?: boolean;
	transcript?: string;
	previewUri?: string,
}): InkFileData => {

	const {
		tldrawData,
		previewUri,
		previewIsOutdated = false,
		previewIsDarkMode,
	} = props;

	let pageData: InkFileData = {
		meta: {
			pluginVersion: PLUGIN_VERSION,
			tldrawVersion: TLDRAW_VERSION,
		},
		tldraw: tldrawData,
	}

	if(previewIsOutdated) pageData.meta.previewIsOutdated = previewIsOutdated;
	if(previewIsDarkMode) pageData.meta.previewIsDarkMode = previewIsDarkMode;
	if(previewUri) pageData.previewUri = previewUri;

	return pageData;
};

export const stringifyPageData = (pageData: InkFileData): string => {
	return JSON.stringify(pageData, null, '\t');
}