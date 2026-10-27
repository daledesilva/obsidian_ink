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

/**
 * One dedicated worker for warp and convert. Terminate on cancel. There is no
 * UI-thread thinning fallback — a missing worker or WASM is an error.
 */
export class PhotoTraceWorkerClient {
	private worker: Worker | null = null;
	private workerObjectUrl: string | null = null;
	private cancelled = false;

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
				reject(error.error ?? new Error(error.message || 'Photo worker failed'));
			};
			const cleanup = () => {
				self.clearTimeout(timeoutId);
				worker.removeEventListener('message', onMessage);
				worker.removeEventListener('error', onError);
			};
			worker.addEventListener('message', onMessage);
			worker.addEventListener('error', onError);
			worker.postMessage(payload);
		});
	}
}
