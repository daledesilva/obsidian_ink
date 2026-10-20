import type { InkStroke } from 'src/ink-canvas/types';
import type { PagePoint } from './find-page-quad';
import type { PagePhotoAdjustment } from './adjust-page-photo';

//////////
//////////

export type PhotoTraceWorkerRequest =
	| {
		type: 'init';
		id: string;
		wasmBytes: ArrayBuffer;
	}
	| {
		type: 'warp';
		id: string;
		rgba: Uint8ClampedArray;
		width: number;
		height: number;
		corners: [PagePoint, PagePoint, PagePoint, PagePoint];
		maxEdgePx: number;
	}
	| {
		type: 'convert';
		id: string;
		rgba: Uint8ClampedArray;
		width: number;
		height: number;
		corners: [PagePoint, PagePoint, PagePoint, PagePoint];
		maxEdgePx: number;
		adjustment: PagePhotoAdjustment;
		dropLargeBorderComponents?: boolean;
		simplifyEpsilon?: number;
		minPolylineLengthPx?: number;
	};

export type PhotoTraceWorkerResponse =
	| {
		type: 'progress';
		id: string;
		stage: string;
		percent?: number;
	}
	| {
		type: 'init-done';
		id: string;
	}
	| {
		type: 'warp-done';
		id: string;
		rgba: Uint8ClampedArray;
		width: number;
		height: number;
	}
	| {
		type: 'convert-done';
		id: string;
		strokes: InkStroke[];
		writingLineHeight: number;
		pageRgba: Uint8ClampedArray;
		pageWidth: number;
		pageHeight: number;
	}
	| {
		type: 'error';
		id: string;
		message: string;
	};
