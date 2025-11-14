import { Canvg } from 'canvg';

//////////
//////////

export async function svgToPngDataUri(svgObj: { height: number; width: number; svg: string }): Promise<string | null> {
  try {
    // Extract width and height from the SVG element
    let width = Math.max(1, Math.floor(svgObj.width));
    let height = Math.max(1, Math.floor(svgObj.height));

    // Scale up or down with bounds
    if (width > 1500 || height > 2000) {
      while (width > 1500 || height > 2000) {
        width = Math.ceil(width / 2);
        height = Math.ceil(height / 2);
      }
    } else if (width < 500) {
      while (width < 500) {
        width *= 2;
        height *= 2;
      }
    }

    // Set canvas dimensions
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    // Ensure transparent background
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      console.error(`Error converting SVG to PNG: 2d canvas context not found`);
      return null;
    }

    // Render SVG onto canvas
    const canvgRenderer = await Canvg.from(ctx, svgObj.svg);

    // Match renderer to canvas size if available
    if (typeof (canvgRenderer as any).resize === 'function') {
      (canvgRenderer as any).resize(width, height);
    }

    // Render is async; wait for completion
    await canvgRenderer.render();

    // Convert canvas to PNG data URI with transparent background
    const dataURL = canvas.toDataURL('image/png');

    // Cleanup
    if (typeof (canvgRenderer as any).stop === 'function') {
      (canvgRenderer as any).stop();
    }
    canvas.remove();

    return dataURL;
  } catch (error) {
    console.error(`Error converting SVG to PNG: ${error}`);
    return null;
  }
}
