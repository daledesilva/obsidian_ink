import { createCanvas } from '@napi-rs/canvas';

//////////
//////////

/**
 * Node 2D canvas for Canvg PNG rasterization in live eval / unit tests.
 * Production Ink uses Obsidian `createEl('canvas')` instead.
 */
export function createNodeWritingSvgCanvas(): HTMLCanvasElement {
	return createCanvas(1, 1) as unknown as HTMLCanvasElement;
}
