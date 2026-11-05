import {
	ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
	ALMOSTUSEFUL_CLIENT_ID,
} from 'src/logic/almostuseful/almostuseful-constants';
import { almostUsefulRequestJson } from 'src/logic/almostuseful/almostuseful-http';
import { readAlmostUsefulSession, resolveAlmostUsefulPortalOrigin } from 'src/logic/almostuseful/almostuseful-session';

//////////
//////////

export const HANDWRITING_TRANSCRIPTION_JOB_PATH = '/api/jobs/handwriting-transcription';

export const HANDWRITING_TRANSCRIPTION_MODELS = {
	geminiFlashLite: 'google/gemini-2.5-flash-lite',
	geminiFlash: 'google/gemini-2.5-flash',
	gpt5Nano: 'openai/gpt-5-nano',
	gpt41Mini: 'openai/gpt-4.1-mini',
	claudeHaiku45: 'anthropic/claude-haiku-4.5',
} as const;

export type HandwritingTranscriptionModel =
	(typeof HANDWRITING_TRANSCRIPTION_MODELS)[keyof typeof HANDWRITING_TRANSCRIPTION_MODELS];

export type HandwritingTranscriptionMediaType = 'image/svg+xml' | 'image/png';

export interface HandwritingTranscriptionJobRequest {
	idempotencyKey: string;
	mediaType: HandwritingTranscriptionMediaType;
	mediaBase64: string;
	/** Optional eval override — portal uses env default when omitted. */
	model?: HandwritingTranscriptionModel;
	clientId: string;
	displayName: string;
}

export interface HandwritingTranscriptionJobResponse {
	text: string;
	model: string;
	mediaType: HandwritingTranscriptionMediaType;
	/** Optional pool share left after the job. Not required for a valid response. */
	remainingPercent?: number;
	/** Optional job cost as a share of the pool. Not required for a valid response. */
	costPercent?: number;
}

/** Portal code for an SVG/PNG the route will not accept. */
export const HANDWRITING_TRANSCRIPTION_MEDIA_TOO_LARGE_CODE = 'media_too_large';

export const HANDWRITING_TRANSCRIPTION_TOO_LONG_NOTICE =
	'This file can\'t be transcribed currently because it is too long. This will be fixed in a future update to Ink.';

/**
 * Portal job failure. `retryable` is the signal for the queue, not the English message.
 */
export class HandwritingTranscriptionJobError extends Error {
	readonly status: number;
	readonly code: string | null;
	readonly retryable: boolean;

	constructor(params: {
		message: string;
		status: number;
		code: string | null;
		retryable: boolean;
	}) {
		super(params.message);
		this.name = 'HandwritingTranscriptionJobError';
		this.status = params.status;
		this.code = params.code;
		this.retryable = params.retryable;
	}
}

/**
 * Notice text for one job failure. Too-long copy is Ink's; other messages come from the error.
 */
export function handwritingTranscriptionNoticeForError(
	error: HandwritingTranscriptionJobError,
): string {
	const isTooLong = error.code === HANDWRITING_TRANSCRIPTION_MEDIA_TOO_LARGE_CODE
		|| error.status === 413;
	if (isTooLong) return HANDWRITING_TRANSCRIPTION_TOO_LONG_NOTICE;
	return error.message;
}

/**
 * 408, 429, and 5xx can succeed later. Other 4xx will not, when the body omits `retryable`.
 */
function isRetryableJobStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

function readJobErrorCode(json: unknown): string | null {
	if (!json || typeof json !== 'object') return null;
	const code = (json as { code?: unknown }).code;
	if (typeof code !== 'string' || !code) return null;
	return code;
}

function readJobErrorRetryable(json: unknown, status: number): boolean {
	if (!json || typeof json !== 'object') return isRetryableJobStatus(status);
	const retryable = (json as { retryable?: unknown }).retryable;
	if (typeof retryable === 'boolean') return retryable;
	return isRetryableJobStatus(status);
}

function readJobErrorMessage(json: unknown, status: number): string {
	if (json && typeof json === 'object' && typeof (json as { error?: unknown }).error === 'string') {
		return (json as { error: string }).error;
	}
	return `Handwriting transcription failed (${status})`;
}

/**
 * Maps a portal response to a typed job error. 413 is too-large even when the body is empty.
 */
function handwritingTranscriptionJobErrorFromResponse(
	status: number,
	json: unknown,
): HandwritingTranscriptionJobError {
	if (status === 413) {
		return new HandwritingTranscriptionJobError({
			message: 'media payload is too large',
			status,
			code: HANDWRITING_TRANSCRIPTION_MEDIA_TOO_LARGE_CODE,
			retryable: false,
		});
	}
	const code = readJobErrorCode(json);
	const retryable = readJobErrorRetryable(json, status);
	if (status === 402) {
		return new HandwritingTranscriptionJobError({
			message: 'Insufficient Almost Useful credits',
			status,
			code: code ?? 'payment_required',
			retryable,
		});
	}
	return new HandwritingTranscriptionJobError({
		message: readJobErrorMessage(json, status),
		status,
		code,
		retryable,
	});
}

export function buildHandwritingTranscriptionJobRequest(params: {
	mediaType: HandwritingTranscriptionMediaType;
	mediaBase64: string;
	model?: HandwritingTranscriptionModel;
	idempotencyKey?: string;
	clientId?: string;
	displayName?: string;
}): HandwritingTranscriptionJobRequest {
	const body: HandwritingTranscriptionJobRequest = {
		idempotencyKey: params.idempotencyKey ?? crypto.randomUUID(),
		mediaType: params.mediaType,
		mediaBase64: params.mediaBase64,
		clientId: params.clientId ?? ALMOSTUSEFUL_CLIENT_ID,
		displayName: params.displayName ?? ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
	};
	if (params.model) {
		body.model = params.model;
	}
	return body;
}

function parseHandwritingTranscriptionJobResponse(
	json: unknown,
): HandwritingTranscriptionJobResponse | null {
	if (!json || typeof json !== 'object') return null;
	const record = json as Record<string, unknown>;
	if (typeof record.text !== 'string') return null;
	if (typeof record.model !== 'string') return null;
	if (record.mediaType !== 'image/svg+xml' && record.mediaType !== 'image/png') return null;
	const parsed: HandwritingTranscriptionJobResponse = {
		text: record.text,
		model: record.model,
		mediaType: record.mediaType,
	};
	if (typeof record.remainingPercent === 'number') {
		parsed.remainingPercent = record.remainingPercent;
	}
	if (typeof record.costPercent === 'number') {
		parsed.costPercent = record.costPercent;
	}
	return parsed;
}

/**
 * POST handwriting-transcription to the Almost Useful portal. Caller supplies
 * media base64; optional model for eval. System prompt is portal-controlled.
 */
export async function postHandwritingTranscriptionJob(
	body: HandwritingTranscriptionJobRequest,
	options?: { accessToken?: string },
): Promise<HandwritingTranscriptionJobResponse> {
	const accessToken = options?.accessToken ?? readAlmostUsefulSession()?.accessToken;
	if (!accessToken) {
		throw new HandwritingTranscriptionJobError({
			message: 'Almost Useful account is not signed in',
			status: 401,
			code: 'unauthorized',
			retryable: false,
		});
	}

	const portalOrigin = resolveAlmostUsefulPortalOrigin();
	let status: number;
	let json: unknown;
	try {
		const response = await almostUsefulRequestJson({
			url: `${portalOrigin}${HANDWRITING_TRANSCRIPTION_JOB_PATH}`,
			method: 'POST',
			accessToken,
			body,
		});
		status = response.status;
		json = response.json;
	} catch {
		// requestUrl throws on network failure. The same SVG can succeed later.
		throw new HandwritingTranscriptionJobError({
			message: 'Handwriting transcription failed',
			status: 0,
			code: null,
			retryable: true,
		});
	}

	if (status < 200 || status >= 300) {
		throw handwritingTranscriptionJobErrorFromResponse(status, json);
	}

	const parsed = parseHandwritingTranscriptionJobResponse(json);
	if (!parsed) {
		throw new HandwritingTranscriptionJobError({
			message: 'Invalid handwriting transcription response',
			status,
			code: null,
			retryable: true,
		});
	}
	return parsed;
}
