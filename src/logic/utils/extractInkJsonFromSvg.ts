import { DOMParser } from 'xmldom';
import { TLEditorSnapshot } from '@tldraw/tldraw';
import { InkFileData } from '../../components/formats/current/types/file-data';
import type { InkCanvasSnapshot } from 'src/ink-canvas/types';

/////////////////////
/////////////////////

/**
 * Cheap file-type check for picker discovery — avoids DOMParser + JSON.parse of large
 * tldraw/ink-canvas payloads when we only need to know writing vs drawing.
 * Returns null when the SVG does not look like an Ink attachment of a single known type.
 */
export function sniffInkSvgFileType(svgString: string): 'inkWriting' | 'inkDrawing' | null {
	const trimmedStart = svgString.trimStart();
	if (!trimmedStart.startsWith('<')) return null;

	const hasInkMarker =
		/<ink[\s>]/i.test(svgString)
		|| /<ink-canvas[\s>]/i.test(svgString)
		|| /<tldraw[\s>]/i.test(svgString);
	if (!hasInkMarker) return null;

	const isWriting = /file-type\s*=\s*["']inkWriting["']/i.test(svgString);
	const isDrawing = /file-type\s*=\s*["']inkDrawing["']/i.test(svgString);
	if (isWriting && !isDrawing) return 'inkWriting';
	if (isDrawing && !isWriting) return 'inkDrawing';
	// Match extractInkCanvasFormat: ink-canvas without file-type defaults to drawing
	if (!isWriting && !isDrawing && /<ink-canvas[\s>]/i.test(svgString)) {
		return 'inkDrawing';
	}
	return null;
}

/**
 * Extracts JSON content from SVG metadata.
 * Supports two metadata formats:
 * - `<ink-canvas version="…">` — ink-canvas engine (`inkCanvas` snapshot)
 * - `<tldraw version="...">` — tldraw engine (`tldraw` snapshot)
 *
 * Also reads `<ink file-type="...">` for the file type discriminator.
 * @param svgString - The SVG string containing the metadata element
 * @returns The parsed InkFileData or null if not found/invalid
 */
export function extractInkJsonFromSvg(svgString: string): InkFileData | null {
    try {
        // Parse the SVG string as XML
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        
        // Check for parsing errors
        const parseError = doc.getElementsByTagName('parsererror');
        if (parseError.length > 0) {
            console.warn('Failed to parse SVG as XML');
            return null;
        }
        
        // Find the metadata element
        const metadataElements = doc.getElementsByTagName('metadata');
        if (metadataElements.length === 0) {
            console.warn('No metadata element found in SVG');
            return null;
        }
        
        const metadataElement = metadataElements[0];

        // Try ink-canvas format first (new format)
        const inkCanvasElements = metadataElement.getElementsByTagName('ink-canvas');
        if (inkCanvasElements.length > 0) {
            return extractInkCanvasFormat(metadataElement, inkCanvasElements[0], svgString);
        }

        // Fall back to tldraw format (legacy)
        return extractTldrawFormat(metadataElement, svgString);
        
    } catch (error) {
        console.error('Error extracting ink metadata JSON:', error);
        return null;
    }
}


// Format-specific extractors
/////////////////////

function extractInkCanvasFormat(
    metadataElement: Element,
    inkCanvasElement: Element,
    svgString: string,
): InkFileData | null {
    const jsonText = inkCanvasElement.textContent?.trim();
    if (!jsonText) {
        console.warn('No JSON content in <ink-canvas> element');
        return null;
    }

    const inkCanvasSnapshot = JSON.parse(jsonText) as InkCanvasSnapshot;

    // Read file type from <ink> element (required for all ink files)
    const inkElements = metadataElement.getElementsByTagName('ink');
    let fileTypeText: string | undefined;
    if (inkElements.length > 0) {
        fileTypeText = inkElements[0].getAttribute('file-type') || undefined;
    }
    // ink-canvas format is only used for drawings
    if (!fileTypeText) fileTypeText = 'inkDrawing';

    const pluginVersionAttr = inkElements.length > 0
        ? (inkElements[0].getAttribute('plugin-version') || '')
        : '';

    return {
        meta: {
            pluginVersion: pluginVersionAttr,
            tldrawVersion: '',
            fileType: fileTypeText as 'inkDrawing' | 'inkWriting',
        },
        tldraw: {} as TLEditorSnapshot, // Not used for ink-canvas files
        inkCanvas: inkCanvasSnapshot,
        svgString,
    };
}

function extractTldrawFormat(
    metadataElement: Element,
    svgString: string,
): InkFileData | null {
    // Gate on filetype being 'inkDrawing' or 'inkWriting' before parsing tldraw
    const inkElements = metadataElement.getElementsByTagName('ink');
    let fileTypeText: string | undefined;
    if (inkElements.length > 0) {
        fileTypeText = inkElements[0].getAttribute('file-type') || undefined;
    }
    if (!fileTypeText) {
        console.warn('No filetype found in metadata');
        return null;
    }
    if (fileTypeText !== 'inkDrawing' && fileTypeText !== 'inkWriting') {
        console.warn('Unsupported or missing filetype in metadata');
        return null;
    }

    const tldrawElements = metadataElement.getElementsByTagName('tldraw');
    if (tldrawElements.length === 0) {
        console.warn('No tldraw element found in metadata');
        return null;
    }
    
    const settingsElement = tldrawElements[0];
    const jsonText = settingsElement.textContent?.trim();
    
    if (!jsonText) {
        console.warn('No JSON content found in metadata settings element');
        return null;
    }
    
    const tldrawSnapshot = JSON.parse(jsonText) as TLEditorSnapshot;
    const pluginVersionAttr = inkElements.length > 0
        ? (inkElements[0].getAttribute('plugin-version') || undefined)
        : undefined;
    const tldrawVersionAttr = settingsElement.getAttribute('version') || undefined;

    // Read per-file writingLineHeight
    const writingLineHeightAttr = inkElements.length > 0
        ? inkElements[0].getAttribute('writing-line-height')
        : null;
    const writingLineHeightParsed = writingLineHeightAttr
        ? parseInt(writingLineHeightAttr, 10)
        : undefined;
    const writingLineHeight = writingLineHeightParsed !== undefined && !isNaN(writingLineHeightParsed)
        ? writingLineHeightParsed
        : undefined;

    return {
        meta: {
            pluginVersion: pluginVersionAttr || '',
            tldrawVersion: tldrawVersionAttr || '',
            fileType: fileTypeText,
            writingLineHeight,
        },
        tldraw: tldrawSnapshot,
        svgString,
    };
}
