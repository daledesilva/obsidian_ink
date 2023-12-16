import { SerializedStore } from '@tldraw/store';
import { TLRecord } from '@tldraw/tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';

///////
///////

type Metadata = {
	pluginVersion: string;
	tldrawVersion: string;
	previewIsLightMode?: boolean;
	transcript?: string;
};

export type PageData = {
	meta: Metadata;
	tldraw: SerializedStore<TLRecord>;
	previewUri?: string;
};

// Primary functions
///////

export const buildPageFile = (tldrawData: SerializedStore<TLRecord>, pngDataUri: string | null) => {
	let str = '';
	// str += buildFrontMatter();
	// str += '\n';
	str += buildBody(tldrawData, pngDataUri);
	return str;
};

// Helper functions
///////

// const buildFrontMatter = () => {
// 	let str = '';
// 	str += '---\n';
// 	str += 'summary: Eventually a summary will go in here\n'
// 	str += 'tags: [handwritten]\n';
// 	str += '---\n';
// 	return str;
// };

const buildBody = (tldrawData: SerializedStore<TLRecord>, previewUri: string | null): string => {

	let bodyData: PageData = {
		meta: {
			pluginVersion: PLUGIN_VERSION,
			tldrawVersion: TLDRAW_VERSION,
		},
		tldraw: tldrawData,
	}
	if(previewUri) bodyData.previewUri = previewUri;
	if(previewUri) bodyData.meta.previewIsLightMode = false;	// TODO: Need to dynamically fetch this from Obsidian or tlDraw

	return JSON.stringify(bodyData, null, '\t');
};