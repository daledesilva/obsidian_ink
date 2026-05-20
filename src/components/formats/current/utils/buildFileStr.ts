import { TLDRAW_VERSION } from 'src/constants';
import { DOMParser, XMLSerializer } from 'xmldom';
import format from 'xml-formatter';
import { InkFileData } from '../types/file-data';

//////////////////////////
//////////////////////////


// V2 format: SVG file with JSON metadata embedded
export const buildFileStr = (pageData: InkFileData): string => {
    // Prefer svgString for v2; fall back to previewUri for backward compatibility
    let fileStr = pageData.svgString || '<svg></svg>';

	// Create svg/xml document
	const parser = new DOMParser();
	const doc = parser.parseFromString(fileStr, 'image/svg+xml');
	const svgElement = doc.documentElement;

	// Prepare tldraw JSON only (no meta in JSON)
	const tldrawJson = pageData.tldraw;

	// Remove existing metadata to avoid duplicates when re-serializing
	const existingMetadata = svgElement.getElementsByTagName('metadata');
	while (existingMetadata.length > 0) {
		existingMetadata[0].parentNode?.removeChild(existingMetadata[0]);
	}

	// Create settings in xml
	const metadataElement = doc.createElement('metadata');

	// <ink> meta with attributes
	const inkMetaElement = doc.createElement('ink');
	inkMetaElement.setAttribute('plugin-version', String(pageData.meta.pluginVersion));
	inkMetaElement.setAttribute('file-type', pageData.meta.fileType);
	if (pageData.meta.writingLineHeight !== undefined) {
		inkMetaElement.setAttribute('writing-line-height', String(pageData.meta.writingLineHeight));
	}
	metadataElement.appendChild(inkMetaElement);

	// <tldraw version="..."> JSON </tldraw>
	const settingsElement = doc.createElement('tldraw');
	settingsElement.setAttribute('version', String(TLDRAW_VERSION));
	settingsElement.textContent = JSON.stringify(tldrawJson, null, 2);
	metadataElement.appendChild(settingsElement);

	svgElement.appendChild(metadataElement);

	const serializedSvg = new XMLSerializer().serializeToString(svgElement);
	// Export as formatted svg
	return format(serializedSvg, {
		indentation: '\t',
		lineSeparator: '\n'
	});
}