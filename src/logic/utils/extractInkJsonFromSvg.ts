/**
 * Extracts JSON content from an inkdrawing XML element
 * @param svgString - The SVG string containing the inkdrawing element
 * @returns The parsed JSON object from the inkdrawing element, or null if not found/invalid
 */
export function extractInkJsonFromSvg(svgString: string): any | null {
    try {
        // Use regex to find the inkdrawing element and extract its content
        const inkDrawingRegex = /<inkdrawing[^>]*>([\s\S]*?)<\/inkdrawing>/i;
        const match = svgString.match(inkDrawingRegex);
        
        if (!match) {
            console.warn('No inkdrawing element found in SVG');
            return null;
        }
        
        // Extract the content between the inkdrawing tags
        const jsonText = match[1].trim();
        
        if (!jsonText) {
            console.warn('No JSON content found in inkdrawing element');
            return null;
        }
        
        // Parse the JSON content
        const jsonData = JSON.parse(jsonText);
        return jsonData;
        
    } catch (error) {
        console.error('Error extracting inkdrawing JSON:', error);
        return null;
    }
}

/**
 * Extracts JSON content from an inkdrawing XML element with type safety
 * @param svgString - The SVG string containing the inkdrawing element
 * @returns The parsed JSON object from the inkdrawing element, or null if not found/invalid
 */
export function extractInkJsonFromSvgTyped<T = any>(svgString: string): T | null {
    const result = extractInkJsonFromSvg(svgString);
    return result as T | null;
} 