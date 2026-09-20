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
	gpt5Nano: 'openai/gpt-5-nano',
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
	creditsRemaining: string;
	amountUsd: string;
	model: string;
	mediaType: HandwritingTranscriptionMediaType;
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
	if (typeof record.creditsRemaining !== 'string') return null;
	if (typeof record.amountUsd !== 'string') return null;
	if (typeof record.model !== 'string') return null;
	if (record.mediaType !== 'image/svg+xml' && record.mediaType !== 'image/png') return null;
	return {
		text: record.text,
		creditsRemaining: record.creditsRemaining,
		amountUsd: record.amountUsd,
		model: record.model,
		mediaType: record.mediaType,
	};
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
		throw new Error('Almost Useful account is not signed in');
	}

	const portalOrigin = resolveAlmostUsefulPortalOrigin();
	const { status, json } = await almostUsefulRequestJson({
		url: `${portalOrigin}${HANDWRITING_TRANSCRIPTION_JOB_PATH}`,
		method: 'POST',
		accessToken,
		body,
	});

	if (status === 402) {
		throw new Error('Insufficient Almost Useful credits');
	}
	if (status < 200 || status >= 300) {
		const errorMessage =
			json && typeof json === 'object' && typeof (json as { error?: unknown }).error === 'string'
				? (json as { error: string }).error
				: `Handwriting transcription failed (${status})`;
		throw new Error(errorMessage);
	}

	const parsed = parseHandwritingTranscriptionJobResponse(json);
	if (!parsed) {
		throw new Error('Invalid handwriting transcription response');
	}
	return parsed;
}
