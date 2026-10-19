import { traceHandwritingFromRaster, type PhotoTraceRasterInput } from './trace-from-raster';

//////////
//////////

export interface PhotoTraceWorkerRequest {
	id: string;
	width: number;
	height: number;
	gray: Uint8Array;
	dropLargeBorderComponents?: boolean;
	simplifyEpsilon?: number;
	minPolylineLengthPx?: number;
}

export interface PhotoTraceWorkerResponse {
	id: string;
	strokes: import('src/ink-canvas/types').InkStroke[];
	writingLineHeight: number;
}

self.onmessage = (event: MessageEvent<PhotoTraceWorkerRequest>) => {
	const payload = event.data;
	const input: PhotoTraceRasterInput = {
		width: payload.width,
		height: payload.height,
		gray: payload.gray,
		dropLargeBorderComponents: payload.dropLargeBorderComponents,
		simplifyEpsilon: payload.simplifyEpsilon,
		minPolylineLengthPx: payload.minPolylineLengthPx,
	};
	const result = traceHandwritingFromRaster(input);
	const response: PhotoTraceWorkerResponse = {
		id: payload.id,
		strokes: result.strokes,
		writingLineHeight: result.writingLineHeight,
	};
	self.postMessage(response);
};
