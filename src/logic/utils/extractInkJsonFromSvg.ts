import { DOMParser } from 'xmldom';
import { TLEditorSnapshot } from 'tldraw';
import { InkFileData } from '../../components/formats/current/types/file-data';

/////////////////////
/////////////////////

/**
 * Extracts JSON content from a <tldraw> XML element within SVG metadata.
 * Falls back to legacy <inkdrawing> element for backward compatibility.
 * Also reads an optional <filetype> sibling and merges into meta.fileType if present.
 * @param svgString - The SVG string containing the metadata element
 * @returns The parsed JSON object or null if not found/invalid
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
        
        // Look for tldraw element within metadata
        const metadataElement = metadataElements[0];

        // Gate on filetype being 'inkDrawing' or 'inkWriting' before parsing tldraw
        // Prefer <ink fileType="..."> attribute; fall back to <filetype> element if present
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
        
        // Ensure tldraw exists
        const hasTldraw = tldrawElements.length > 0;
        if (!hasTldraw) {
            console.warn('No tldraw element found in metadata');
            return null;
        }
        
        // Get the content of the tldraw element
        const settingsElement = tldrawElements[0];
        const jsonText = settingsElement.textContent?.trim();
        
        if (!jsonText) {
            console.warn('No JSON content found in metadata settings element');
            return null;
        }
        
        // Parse the JSON content (tldraw snapshot only)
        const tldrawSnapshot = JSON.parse(jsonText) as TLEditorSnapshot;

        // Also read pluginVersion from <ink>
        const pluginVersionAttr = inkElements.length > 0 ? (inkElements[0].getAttribute('plugin-version') || undefined) : undefined;

        // Read tldraw version from <tldraw version="...">
        const tldrawVersionAttr = settingsElement.getAttribute('version') || undefined;

        // Construct InkFileData result
        const inkFileData: InkFileData = {
            meta: {
                pluginVersion: pluginVersionAttr || '',
                tldrawVersion: tldrawVersionAttr || '',
                fileType: fileTypeText,
            },
            tldraw: tldrawSnapshot,
        } as InkFileData;

        return inkFileData;
        
    } catch (error) {
        console.error('Error extracting tldraw metadata JSON:', error);
        return null;
    }
}