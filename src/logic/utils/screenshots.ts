import { Canvg } from 'canvg';

//////////
//////////

export async function svgToPngDataUri(svgObj: { height: number; width: number; svg: string }): Promise<string | null> {
	try {
		const sourceWidth = Math.max(1, svgObj.width);
		const sourceHeight = Math.max(1, svgObj.height);
		// Two device pixels per typical 700px note column keeps handwriting crisp in
		// PDF without retaining the often much larger SVG coordinate dimensions.
		const widthScale = Math.min(1, 1400 / sourceWidth);
		const heightScale = Math.min(1, 16000 / sourceHeight);
		const upscale = sourceWidth < 600 ? 600 / sourceWidth : 1;
		const scale = Math.min(upscale, widthScale, heightScale);
		const width = Math.max(1, Math.round(sourceWidth * scale));
		const height = Math.max(1, Math.round(sourceHeight * scale));
		
		// Set canvas dimensions
		const canvas = activeDocument.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			console.error(`Error converting SVG to PNG: ${'2d canvas context not found'}`);
			return null;
		}
		
		// Render SVG onto canvas
		const svgStr = svgObj.svg;
		const canvgRenderer = await Canvg.from(ctx, svgStr);
		canvgRenderer.resize(width, height, 'xMidYMid meet');
		await canvgRenderer.render();
		
		// Convert canvas to PNG data URI with transparent background
		const dataURL = canvas.toDataURL('image/png');
		
		// Remove temporary canvas element
		canvas.remove();

		return dataURL;
	} catch (error) {
		console.error(`Error converting SVG to PNG: ${error}`);
		return null;
	}
}
