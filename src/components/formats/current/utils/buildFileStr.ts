import { INK_CANVAS_FORMAT_VERSION, TLDRAW_VERSION } from 'src/constants';
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
        `<ink ${buildInkElementAttributes(pageData)}/>`,
        buildTranscriptMetadataElement(pageData),
        `<ink-canvas version="${escapeXmlAttribute(INK_CANVAS_FORMAT_VERSION)}">${snapshotJson}</ink-canvas>`,
        '</metadata>',
    ].filter(Boolean).join('\n');

    const metadataPattern = /<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi;
    const fileWithoutMetadata = fileStr.replace(metadataPattern, '');

    const svgOpenPattern = /<svg\b[^>]*>/i;
    if (svgOpenPattern.test(fileWithoutMetadata)) {
        return fileWithoutMetadata.replace(svgOpenPattern, (svgOpen) => `${svgOpen}\n${metadata}`);
    }

    return `<svg xmlns="http://www.w3.org/2000/svg">\n${metadata}\n</svg>`;
}

/**
 * Shared `<ink>` scalar attributes (writing-line-height). Full markdown transcript
 * lives in a sibling `<transcript>` element so newlines round-trip.
 */
function buildInkElementAttributes(pageData: InkFileData): string {
    const writingLineHeightAttr =
        pageData.meta.writingLineHeight !== undefined
            ? ` writing-line-height="${escapeXmlAttribute(String(pageData.meta.writingLineHeight))}"`
            : '';
    const svgContentHashAttr = pageData.meta.svgContentHash
        ? ` svg-content-hash="${escapeXmlAttribute(pageData.meta.svgContentHash)}"`
        : '';
    const svgContentHashedAtAttr = pageData.meta.svgContentHashedAt
        ? ` svg-content-hashed-at="${escapeXmlAttribute(pageData.meta.svgContentHashedAt)}"`
        : '';
    return (
        `plugin-version="${escapeXmlAttribute(String(pageData.meta.pluginVersion))}"` +
        ` file-type="${escapeXmlAttribute(pageData.meta.fileType)}"` +
        writingLineHeightAttr +
        svgContentHashAttr +
        svgContentHashedAtAttr
    );
}

/**
 * Escaped element text preserves markdown newlines; omit the tag when empty.
 */
function buildTranscriptMetadataElement(pageData: InkFileData): string {
    const transcript = pageData.meta.transcript;
    if (!transcript) return '';
    return `<transcript>${escapeXmlText(transcript)}</transcript>`;
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
	const fileStr = pageData.svgString || '<svg></svg>';
	const tldrawJson = pageData.tldraw;

	// String splice keeps xmldom off the hot save path and avoids raw createElement on parsed docs.
	const metadataPattern = /<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi;
	const fileWithoutMetadata = fileStr.replace(metadataPattern, '');

	const transcriptElement = buildTranscriptMetadataElement(pageData);
	const metadata = [
		'<metadata>',
		`<ink ${buildInkElementAttributes(pageData)}/>`,
		`<tldraw version="${escapeXmlAttribute(String(TLDRAW_VERSION))}">`,
		escapeXmlText(JSON.stringify(tldrawJson, null, 2)),
		'</tldraw>',
		'</metadata>',
	].join('\n');

	const svgOpenPattern = /<svg\b[^>]*>/i;
	let serializedSvg: string;
	if (svgOpenPattern.test(fileWithoutMetadata)) {
		serializedSvg = fileWithoutMetadata.replace(
			svgOpenPattern,
			(svgOpen) => `${svgOpen}\n${metadata}`,
		);
	} else {
		serializedSvg = `<svg xmlns="http://www.w3.org/2000/svg">\n${metadata}\n${fileWithoutMetadata}`;
	}

	const formattedSvg = format(serializedSvg, {
		indentation: '\t',
		lineSeparator: '\n',
	});

	// xml-formatter rewrites element text; splice compact <transcript> after format.
	if (!transcriptElement) return formattedSvg;
	return formattedSvg.replace(
		/(<ink\b[^>]*\/>)/,
		`$1\n${transcriptElement}`,
	);
}
