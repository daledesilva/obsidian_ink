import { TLEditorSnapshot } from '@tldraw/tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';
import { DOMParser } from 'xmldom';
import format from 'xml-formatter';

//////////////////////////
//////////////////////////

type Metadata = {
	pluginVersion: string;
	tldrawVersion: string;
	previewIsOutdated?: boolean;
	transcript?: string;
};

type InkFileData = {
	meta: Metadata;
	tldraw: TLEditorSnapshot;
    previewUri?: string;
    svgString?: string;
};

// V2 format: SVG file with JSON metadata embedded
export const buildFileStr = (pageData: InkFileData): string => {
    // Prefer svgString for v2; fall back to previewUri for backward compatibility
    let fileStr = pageData.svgString || pageData.previewUri || '<svg></svg>';

	// Create svg/xml document
	const parser = new DOMParser();
	const doc = parser.parseFromString(fileStr, 'image/svg+xml');
	const svgElement = doc.documentElement;

	// Prep settings for xml
    const jsonSettings = JSON.parse(JSON.stringify(pageData)) as unknown as InkFileData;
    // Exclude raw SVG content from embedded metadata
    delete jsonSettings.svgString;
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