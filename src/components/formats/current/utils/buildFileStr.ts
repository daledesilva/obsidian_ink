import { INK_CANVAS_FORMAT_VERSION, TLDRAW_VERSION } from 'src/constants';
// Maintained fork of xmldom — GHSA-crh6-fp67-6883 has no patch on the deprecated `xmldom` package.
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import format from 'xml-formatter';
import { InkFileData } from '../types/file-data';
import { isInkCanvasFile } from './ink-file-storage-engine';

//////////////////////////
//////////////////////////


// V2 format: SVG file with JSON metadata embedded
export const buildFileStr = (pageData: InkFileData): string => {
    if (isInkCanvasFile(pageData)) return buildInkCanvasFileStr(pageData);
    return buildTldrawFileStr(pageData);
}


// ink-canvas format
//////////////////////////

function buildInkCanvasFileStr(pageData: InkFileData): string {
    // For ink-canvas files, the svgString already contains the full SVG with
    // <ink-canvas> metadata (produced by svg-export.ts). We just need to ensure
    // the <ink> meta element is present with plugin-version and file-type.
    let fileStr = pageData.svgString || '<svg></svg>';

    const parser = new DOMParser();
    const doc = parser.parseFromString(fileStr, 'image/svg+xml');
    const svgElement = doc.documentElement;

    // Remove existing metadata to rebuild cleanly
    const existingMetadata = svgElement.getElementsByTagName('metadata');
    while (existingMetadata.length > 0) {
        existingMetadata[0].parentNode?.removeChild(existingMetadata[0]);
    }

    const metadataElement = doc.createElement('metadata');

    // <ink> meta
    const inkMetaElement = doc.createElement('ink');
    inkMetaElement.setAttribute('plugin-version', String(pageData.meta.pluginVersion));
    inkMetaElement.setAttribute('file-type', pageData.meta.fileType);
    metadataElement.appendChild(inkMetaElement);

    // <ink-canvas version="0.5.0"> JSON </ink-canvas>
    const inkCanvasElement = doc.createElement('ink-canvas');
    inkCanvasElement.setAttribute('version', INK_CANVAS_FORMAT_VERSION);
    inkCanvasElement.textContent = JSON.stringify(pageData.inkCanvas, null, 2);
    metadataElement.appendChild(inkCanvasElement);

    svgElement.appendChild(metadataElement);

    const serializedSvg = new XMLSerializer().serializeToString(svgElement);
    return format(serializedSvg, {
        indentation: '\t',
        lineSeparator: '\n'
    });
}


// tldraw format (legacy)
//////////////////////////

function buildTldrawFileStr(pageData: InkFileData): string {
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