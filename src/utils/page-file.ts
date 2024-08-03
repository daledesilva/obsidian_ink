import { TLSerializedStore, TLStoreSnapshot } from '@tldraw/tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';

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
	tldraw: TLStoreSnapshot | TLSerializedStore;
	previewUri?: string;
};

// Primary functions
///////

export const buildWritingFileData = (props: {
	tlStoreSnapshot: TLStoreSnapshot | TLSerializedStore,
	previewIsOutdated?: boolean;
	transcript?: string;
	previewUri?: string,
}): InkFileData => {
	
	return buildFileData(props);
}

export const buildDrawingFileData = (props: {
	tlStoreSnapshot: TLStoreSnapshot | TLSerializedStore,
	previewIsOutdated?: boolean;
	previewUri?: string,
}): InkFileData => {

	return buildFileData(props);
}

const buildFileData = (props: {
	tlStoreSnapshot: TLStoreSnapshot | TLSerializedStore,
	previewIsOutdated?: boolean;
	transcript?: string;
	previewUri?: string,
}): InkFileData => {

	const {
		tlStoreSnapshot,
		previewUri,
		previewIsOutdated = false,
	} = props;

	let pageData: InkFileData = {
		meta: {
			pluginVersion: PLUGIN_VERSION,
			tldrawVersion: TLDRAW_VERSION,
		},
		tldraw: tlStoreSnapshot,
	}

	if(previewIsOutdated) pageData.meta.previewIsOutdated = previewIsOutdated;
	if(previewUri) pageData.previewUri = previewUri;

	return pageData;
};

export const stringifyPageData = (pageData: InkFileData): string => {
	return JSON.stringify(pageData, null, '\t');
}