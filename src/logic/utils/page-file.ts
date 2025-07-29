import { TLEditorSnapshot } from '@tldraw/tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';
import { DOMParser } from 'xmldom'; // or similar
import format from 'xml-formatter';

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

export const buildFileStr = (pageData: InkFileData): string => {
	let fileStr = pageData.previewUri || '<svg></svg>';

	// Create svg/xml document
	const parser = new DOMParser();
	const doc = parser.parseFromString(fileStr, 'image/svg+xml');
	const svgElement = doc.documentElement;

	// Prep settings for xml
	const jsonSettings = JSON.parse(JSON.stringify(pageData)) as unknown as InkFileData;
	delete jsonSettings.previewUri;
	
	// Create settings in xml
	const metadataElement = doc.createElement('metadata');
	const settingsElement = doc.createElement('inkdrawing');
	settingsElement.setAttribute('version', '1');
	settingsElement.textContent = JSON.stringify(jsonSettings, null, 2);
	metadataElement.appendChild(settingsElement);
	svgElement.appendChild(metadataElement);

	// Export as formatted svg
	return format(svgElement.toString(), {
		indentation: '\t',
		lineSeparator: '\n'
	});
}