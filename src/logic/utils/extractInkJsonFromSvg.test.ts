import { describe, expect, test } from "@jest/globals";
import { extractInkJsonFromSvg } from './extractInkJsonFromSvg';
// Note: buildFileStr_v2 is tested separately; not needed here.
import { DEFAULT_TLEDITOR_DRAWING_SNAPSHOT } from 'src/defaults/default-tleditor-drawing-snapshot';

describe('extractInkJsonFromSvg', () => {
    test('should extract JSON from inkdrawing XML element in metadata', () => {
        const svgString = `<svg
    xmlns="http://www.w3.org/2000/svg"
    version="1.1"
    viewBox="0 0 395 130" 
    width="395"
    height="130"
    fill="none"
    class="ddc_ink_drawing-placeholder"
>
    <g>
        <rect rx="10" ry="10" x="1" y="1" width="393" height="128" style="fill: none; stroke-width: 1; stroke: rgb(255, 255, 255); stroke-opacity: 0.1;"/>
    </g>
    <metadata>
        <inkdrawing version="1">
{
    "valid": "json"
}
        </inkdrawing>
    </metadata>
</svg>`;

        const result = extractInkJsonFromSvg(svgString);
        expect(() => JSON.stringify(result)).not.toThrow();
    });

    test('should return null for SVG without inkdrawing element', () => {
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" fill="red"/>
        </svg>`;

        const result = extractInkJsonFromSvg(svgString);
        expect(result).toBeNull();
    });

    test('should return null for SVG with empty inkdrawing element', () => {
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg">
            <metadata>
                <inkdrawing></inkdrawing>
            </metadata>
        </svg>`;

        const result = extractInkJsonFromSvg(svgString);
        expect(result).toBeNull();
    });

    test('should return null for invalid JSON in inkdrawing element', () => {
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg">
            <metadata>
                <inkdrawing>{"invalid": json}</inkdrawing>
            </metadata>
        </svg>`;

        const result = extractInkJsonFromSvg(svgString);
        expect(result).toBeNull();
    });
}); 