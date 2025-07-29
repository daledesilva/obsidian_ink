import { DOMParser } from 'xmldom';

/**
 * Extracts JSON content from an inkdrawing XML element within SVG metadata
 * @param svgString - The SVG string containing the inkdrawing element in metadata
 * @returns The parsed JSON object from the inkdrawing element, or null if not found/invalid
 */
export function extractInkJsonFromSvg<TLEditorSnapshot>(svgString: string): TLEditorSnapshot | null {
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
        
        // Look for inkdrawing element within metadata
        const metadataElement = metadataElements[0];
        const inkdrawingElements = metadataElement.getElementsByTagName('inkdrawing');
        
        if (inkdrawingElements.length === 0) {
            console.warn('No inkdrawing element found in metadata');
            return null;
        }
        
        // Get the content of the inkdrawing element
        const inkdrawingElement = inkdrawingElements[0];
        const jsonText = inkdrawingElement.textContent?.trim();
        
        if (!jsonText) {
            console.warn('No JSON content found in inkdrawing element');
            return null;
        }
        
        // Parse the JSON content
        const jsonData = JSON.parse(jsonText);
        return jsonData as TLEditorSnapshot;
        
    } catch (error) {
        console.error('Error extracting inkdrawing JSON:', error);
        return null;
    }
} 