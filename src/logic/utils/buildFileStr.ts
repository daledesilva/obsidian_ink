import { TLEditorSnapshot } from '@tldraw/tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';
import { DOMParser } from 'xmldom';
import format from 'xml-formatter';

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

// V2 format: SVG file with JSON metadata embedded
export const buildFileStr_v2 = (pageData: InkFileData): string => {
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

// V1 format: Plain JSON string
export const buildFileStr_v1 = (pageData: InkFileData): string => {
    return JSON.stringify(pageData, null, '\t');
}