import { Canvg } from 'canvg';

//////////
//////////

export async function svgToPngDataUri(svgElement: SVGElement): Promise<string | null> {
	try {
		const canvas = document.createElement('canvas');
		// Extract width and height from the SVG element
		const width = svgElement.getAttribute('width') ? Number(svgElement.getAttribute('width')) : 0;
		const height = svgElement.getAttribute('height') ? Number(svgElement.getAttribute('height')) : 0;

		// Set canvas dimensions
		canvas.width = width;
		canvas.height = height;

		// Set background color transparent for PNG
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			console.error(`Error converting SVG to PNG: ${'2d canvas context not found'}`);
			return null;
		}

		// Render SVG onto canvas
		const xmlSerialiser = new XMLSerializer();
		const svgStr = xmlSerialiser.serializeToString(svgElement);
		const canvgRenderer = await Canvg.from(ctx, svgStr);
		canvgRenderer.start();

		// Convert canvas to PNG data URI with transparent background
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