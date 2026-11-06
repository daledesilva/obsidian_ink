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
		/** Sauvola k. Lower keeps fainter pen strokes. */
		sauvolaK?: number;
		/** When true (default), removes tiny specks and isolated margin/paper noise dots. */
		noiseCleanup?: boolean;
		/**
		 * True when rgba is already the warped, illumination-flattened page.
		 * Skips a second homography and a second lighting flatten.
		 */
		alreadyWarped?: boolean;
	}
	| {
		/**
		 * Renders the adjusted ink preview for the page step: flatten, pick the detection
		 * settings, then apply them. Runs here so the dialog can appear immediately with
		 * the plain photo instead of freezing while the whole image is processed.
		 */
		type: 'preview';
		id: string;
		rgba: Uint8ClampedArray;
		width: number;
		height: number;
		/** When set, these are used as-is and auto-tune is skipped. */
		adjustment?: PagePhotoAdjustment;
		inkSensitivity?: number;
		noiseCleanup?: boolean;
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
		type: 'preview-done';
		id: string;
		/** Black-and-white ink mask for the adjusted photo, at the source size. */
		maskRgba: Uint8ClampedArray;
		width: number;
		height: number;
		/** The detection settings that produced the mask, so sliders can show them. */
		adjustment: PagePhotoAdjustment;
		inkSensitivity: number;
	}
	| {
		type: 'error';
		id: string;
		message: string;
	};
