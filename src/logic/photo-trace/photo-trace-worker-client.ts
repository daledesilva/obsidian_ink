import type { PagePhotoAdjustment } from './adjust-page-photo';
import { photoTraceWorkerBundledCode } from './generated/photo-trace-worker-code';
import skeletonWasmBytes from './generated/skeleton.wasm';
import type { PagePoint } from './find-page-quad';
import type { PhotoTraceWorkerRequest, PhotoTraceWorkerResponse } from './photo-trace-worker-protocol';
import type { PhotoTraceResult } from './trace-from-raster';

//////////
//////////

export class PhotoTraceCancelledError extends Error {
	constructor() {
		super('Photo convert was cancelled');
		this.name = 'PhotoTraceCancelledError';
	}
}

export interface PhotoTraceWarpResult {
	rgba: Uint8ClampedArray;
	width: number;
	height: number;
}

export interface PhotoTraceConvertResult extends PhotoTraceResult {
	pageRgba: Uint8ClampedArray;
	pageWidth: number;
	pageHeight: number;
}

export interface PhotoTracePreviewResult {
	/** Black-and-white ink mask for the adjusted photo, at the source size. */
	maskRgba: Uint8ClampedArray;
	width: number;
	height: number;
	/** The detection settings the worker used, so sliders can show them. */
	adjustment: PagePhotoAdjustment;
	inkSensitivity: number;
}

/**
 * One dedicated worker for warp and convert. Terminate on cancel. There is no
 * UI-thread thinning fallback — a missing worker or WASM is an error.
 */
export class PhotoTraceWorkerClient {
	private worker: Worker | null = null;
	private workerObjectUrl: string | null = null;
	private cancelled = false;
	/**
	 * Rejects the request that is in flight. Terminating a worker does not settle its
	 * pending promise, and a batch waits on that promise before showing the next photo,
	 * so cancel must fail the request explicitly or the wizard would stall.
	 */
	private pendingReject: ((error: Error) => void) | null = null;

	constructor(_plugin: unknown) {}

	cancel(): void {
		this.cancelled = true;
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		if (this.workerObjectUrl) {
			URL.revokeObjectURL(this.workerObjectUrl);
			this.workerObjectUrl = null;
		}
		const pendingReject = this.pendingReject;
		this.pendingReject = null;
		pendingReject?.(new PhotoTraceCancelledError());
	}

	/**
	 * Undoes cancel() so the next request starts a fresh worker. A photo batch cancels
	 * one conversion and then keeps going, which the old terminate-for-good cancel could
	 * not express. Only call this once the cancelled request has settled.
	 */
	reset(): void {
		this.cancelled = false;
	}

	async warp(params: {
		rgba: Uint8ClampedArray;
		width: number;
		height: number;
		corners: [PagePoint, PagePoint, PagePoint, PagePoint];
		maxEdgePx: number;
		onProgress?: (stage: string, percent?: number) => void;
	}): Promise<PhotoTraceWarpResult> {
		const response = await this.request({
			type: 'warp',
			id: crypto.randomUUID(),
			rgba: params.rgba,
			width: params.width,
			height: params.height,
			corners: params.corners,
			maxEdgePx: params.maxEdgePx,
		}, params.onProgress);
		if (response.type !== 'warp-done') {
			throw new Error('Photo worker did not return a warped page');
		}
		return { rgba: response.rgba, width: response.width, height: response.height };
	}

	async convert(params: {
		rgba: Uint8ClampedArray;
		width: number;
		height: number;
		corners: [PagePoint, PagePoint, PagePoint, PagePoint];
		maxEdgePx: number;
		adjustment: PagePhotoAdjustment;
		dropLargeBorderComponents?: boolean;
		simplifyEpsilon?: number;
		minPolylineLengthPx?: number;
		sauvolaK?: number;
		noiseCleanup?: boolean;
		alreadyWarped?: boolean;
		onProgress?: (stage: string, percent?: number) => void;
	}): Promise<PhotoTraceConvertResult> {
		const response = await this.request({
			type: 'convert',
			id: crypto.randomUUID(),
			rgba: params.rgba,
			width: params.width,
			height: params.height,
			corners: params.corners,
			maxEdgePx: params.maxEdgePx,
			adjustment: params.adjustment,
			dropLargeBorderComponents: params.dropLargeBorderComponents,
			simplifyEpsilon: params.simplifyEpsilon,
			minPolylineLengthPx: params.minPolylineLengthPx,
			sauvolaK: params.sauvolaK,
			noiseCleanup: params.noiseCleanup,
			alreadyWarped: params.alreadyWarped,
		}, params.onProgress);
		if (response.type !== 'convert-done') {
			throw new Error('Photo worker did not return ink strokes');
		}
		return {
			strokes: response.strokes,
			writingLineHeight: response.writingLineHeight,
			pageRgba: response.pageRgba,
			pageWidth: response.pageWidth,
			pageHeight: response.pageHeight,
		};
	}

	/**
	 * Renders the adjusted ink preview for the page step, off the UI thread.
	 *
	 * The dialog opens with the plain photo first and swaps to this when it lands, which is
	 * what stops a multi-second freeze before the modal appears.
	 */
	async preview(params: {
		rgba: Uint8ClampedArray;
		width: number;
		height: number;
		adjustment?: PagePhotoAdjustment;
		inkSensitivity?: number;
		noiseCleanup?: boolean;
	}): Promise<PhotoTracePreviewResult> {
		const response = await this.request({
			type: 'preview',
			id: crypto.randomUUID(),
			rgba: params.rgba,
			width: params.width,
			height: params.height,
			adjustment: params.adjustment,
			inkSensitivity: params.inkSensitivity,
			noiseCleanup: params.noiseCleanup,
		});
		if (response.type !== 'preview-done') {
			throw new Error('Photo worker did not return a preview');
		}
		return {
			maskRgba: response.maskRgba,
			width: response.width,
			height: response.height,
			adjustment: response.adjustment,
			inkSensitivity: response.inkSensitivity,
		};
	}

	private async ensureWorker(): Promise<Worker> {
		if (this.cancelled) throw new PhotoTraceCancelledError();
		if (this.worker) return this.worker;
		// Worker + WASM ship inside main.js so installs that only copy main.js still convert photos.
		const workerObjectUrl = URL.createObjectURL(
			new Blob([photoTraceWorkerBundledCode], { type: 'text/javascript' }),
		);
		const worker = new Worker(workerObjectUrl);
		this.workerObjectUrl = workerObjectUrl;
		this.worker = worker;
		const wasmBytes = skeletonWasmBytes.buffer.slice(
			skeletonWasmBytes.byteOffset,
			skeletonWasmBytes.byteOffset + skeletonWasmBytes.byteLength,
		);
		await this.requestOnWorker(worker, {
			type: 'init',
			id: crypto.randomUUID(),
			wasmBytes,
		});
		return worker;
	}

	private async request(
		payload: PhotoTraceWorkerRequest,
		onProgress?: (stage: string, percent?: number) => void,
	): Promise<PhotoTraceWorkerResponse> {
		const worker = await this.ensureWorker();
		return this.requestOnWorker(worker, payload, onProgress);
	}

	private requestOnWorker(
		worker: Worker,
		payload: PhotoTraceWorkerRequest,
		onProgress?: (stage: string, percent?: number) => void,
	): Promise<PhotoTraceWorkerResponse> {
		return new Promise((resolve, reject) => {
			if (this.cancelled) {
				reject(new PhotoTraceCancelledError());
				return;
			}
			this.pendingReject = reject;
			const timeoutId = self.setTimeout(() => {
				this.cancel();
				reject(new Error('Photo trace timed out'));
			}, 180_000);
			const onMessage = (event: MessageEvent<PhotoTraceWorkerResponse>) => {
				if (event.data.id !== payload.id) return;
				if (event.data.type === 'progress') {
					onProgress?.(event.data.stage, event.data.percent);
					return;
				}
				cleanup();
				if (event.data.type === 'error') {
					reject(new Error(event.data.message));
					return;
				}
				resolve(event.data);
			};
			const onError = (error: ErrorEvent) => {
				cleanup();
				const workerError: unknown = error.error;
				if (workerError instanceof Error) {
					reject(workerError);
					return;
				}
				reject(new Error(error.message || 'Photo worker failed'));
			};
			const cleanup = () => {
				self.clearTimeout(timeoutId);
				this.pendingReject = null;
				worker.removeEventListener('message', onMessage);
				worker.removeEventListener('error', onError);
			};
			worker.addEventListener('message', onMessage);
			worker.addEventListener('error', onError);
			worker.postMessage(payload);
		});
	}
}
