import { SerializedStore } from '@tldraw/store';
import { TLRecord } from '@tldraw/tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';

///////
///////

type Metadata = {
	pluginVersion: string;
	tldrawVersion: string;
	isEmpty?: boolean;
	previewIsOutdated?: boolean;
	previewIsDarkMode?: boolean;
	transcript?: string;
};

export type PageData = {
	meta: Metadata;
	tldraw: SerializedStore<TLRecord>;
	previewUri?: string;
};

// Primary functions
///////

export const buildPageData = (props: {
	tldrawData: SerializedStore<TLRecord>,
	isEmpty?: boolean;
	previewIsOutdated?: boolean;
	previewIsDarkMode?: boolean;
	transcript?: string;
	previewUri?: string,
}): PageData => {

	const {
		tldrawData,
		isEmpty,
		previewUri,
		previewIsOutdated = false,
		previewIsDarkMode,
	} = props;

	let pageData: PageData = {
		meta: {
			pluginVersion: PLUGIN_VERSION,
			tldrawVersion: TLDRAW_VERSION,
		},
		tldraw: tldrawData,
	}

	if(isEmpty) pageData.meta.isEmpty = isEmpty;
	if(previewIsOutdated) pageData.meta.previewIsOutdated = previewIsOutdated;
	if(previewIsDarkMode) pageData.meta.previewIsDarkMode = previewIsDarkMode;
	if(previewUri) pageData.previewUri = previewUri;

	return pageData;
};

export const stringifyPageData = (pageData: PageData): string => {
	return JSON.stringify(pageData, null, '\t');
}