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
    // The ink-canvas renderer already gives us a complete SVG. Re-parsing and
    // pretty-printing that multi-megabyte document on every autosave blocks the
    // input thread in direct proportion to the number of strokes. Replace just
    // the small metadata block and keep the rendered path markup untouched.
    const fileStr = pageData.svgString || '<svg></svg>';
    const snapshotJson = escapeXmlText(JSON.stringify(pageData.inkCanvas));
    const metadata = [
        '<metadata>',
        `<ink plugin-version="${escapeXmlAttribute(String(pageData.meta.pluginVersion))}" file-type="${escapeXmlAttribute(pageData.meta.fileType)}"/>`,
        `<ink-canvas version="${escapeXmlAttribute(INK_CANVAS_FORMAT_VERSION)}">${snapshotJson}</ink-canvas>`,
        '</metadata>',
    ].join('\n');

    const metadataPattern = /<metadata\b[^>]*>[\s\S]*?<\/metadata>/i;
    if (metadataPattern.test(fileStr)) {
        return fileStr.replace(metadataPattern, metadata);
    }

    const svgOpenPattern = /<svg\b[^>]*>/i;
    if (svgOpenPattern.test(fileStr)) {
        return fileStr.replace(svgOpenPattern, (svgOpen) => `${svgOpen}\n${metadata}`);
    }

    return `<svg xmlns="http://www.w3.org/2000/svg">\n${metadata}\n</svg>`;
}

function escapeXmlText(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeXmlAttribute(value: string): string {
    return escapeXmlText(value)
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
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
