import { SerializedStore } from '@tldraw/store';
import { TLRecord } from '@tldraw/tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';

///////
///////

type Metadata = {
	'plugin-version': string;
	'tldraw-version': string;
};

export type PageData = {
	meta: Metadata;
	tldraw: SerializedStore<TLRecord>;
};

// Primary functions
///////

export const buildPageFile = (tldrawData: SerializedStore<TLRecord>) => {
	let str = '';
	// str += buildFrontMatter();
	// str += '\n';
	str += buildBody(tldrawData);
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

const buildBody = (tldrawData: SerializedStore<TLRecord>): string => {

	let bodyData: PageData = {
		meta: {
			'plugin-version': PLUGIN_VERSION,
			'tldraw-version': TLDRAW_VERSION,
		},
		tldraw: tldrawData,
	}

	return JSON.stringify(bodyData, null, '\t');
};