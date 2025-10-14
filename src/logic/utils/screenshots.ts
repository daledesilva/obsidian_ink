import { Canvg } from 'canvg';

//////////
//////////

export async function svgToPngDataUri(svgObj: {	height: number,	width: number, svg: string, }): Promise<string | null> {
	try {
		// Extract width and height from the SVG element
		let width = svgObj.width;
		let height = svgObj.height;
		
        // Scale up or down
		if (width > 1500 || height > 2000) {
			while(width > 1500) {
				width /= 2;
				height /= 2;
			}
		} else if(width < 500) {
			while(width < 500) {
				width *= 2;
				height *= 2;
			}
		} 
		
		// Set canvas dimensions
		const canvas = document.createElement('canvas');
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
        canvgRenderer.resize(width, height, 'xMidYMid meet')
		canvgRenderer.start();
		
		// Convert canvas to PNG data URI with transparent background
		// @ts-ignore
		const dataURL = canvas.toDataURL('image/png', {alpha: true});
		
		// Remove temporary canvas element
		canvgRenderer.stop();
		canvas.remove();

		return dataURL;
	} catch (error) {
		console.error(`Error converting SVG to PNG: ${error}`);
		return null;
	}
}