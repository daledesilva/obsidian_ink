import {
	ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
	ALMOSTUSEFUL_CLIENT_ID,
} from 'src/logic/almostuseful/almostuseful-constants';
import { almostUsefulRequestJson } from 'src/logic/almostuseful/almostuseful-http';
import { readAlmostUsefulSession, resolveAlmostUsefulPortalOrigin } from 'src/logic/almostuseful/almostuseful-session';
import type { HandwritingVectorStroke } from 'src/logic/photo-trace/map-handwriting-vector-strokes';

//////////
//////////

export const HANDWRITING_VECTOR_JOB_PATH = '/api/jobs/handwriting-vector';

export interface HandwritingVectorJobRequest {
	idempotencyKey: string;
	mediaType: 'image/jpeg';
	mediaBase64: string;
	clientId: string;
	displayName: string;
}

export interface HandwritingVectorJobResponse {
	strokes: HandwritingVectorStroke[];
	model: string;
	mediaType: 'image/jpeg';
	remainingPercent?: number;
	costPercent?: number;
}

export class HandwritingVectorJobError extends Error {
	readonly status: number;
	readonly code: string | null;

	constructor(params: { message: string; status: number; code: string | null }) {
		super(params.message);
		this.name = 'HandwritingVectorJobError';
		this.status = params.status;
		this.code = params.code;
	}
}

export function buildHandwritingVectorJobRequest(params: {
	mediaBase64: string;
	idempotencyKey?: string;
	clientId?: string;
	displayName?: string;
}): HandwritingVectorJobRequest {
	return {
		idempotencyKey: params.idempotencyKey ?? crypto.randomUUID(),
		mediaType: 'image/jpeg',
		mediaBase64: params.mediaBase64,
		clientId: params.clientId ?? ALMOSTUSEFUL_CLIENT_ID,
		displayName: params.displayName ?? ALMOSTUSEFUL_CLIENT_DISPLAY_NAME,
	};
}

/**
 * POST handwriting-vector. Caller supplies the cropped page JPEG as base64.
 */
export async function postHandwritingVectorJob(
	body: HandwritingVectorJobRequest,
	options?: { accessToken?: string; isCancelled?: () => boolean },
): Promise<HandwritingVectorJobResponse> {
	const accessToken = options?.accessToken ?? readAlmostUsefulSession()?.accessToken;
	if (!accessToken) {
		throw new HandwritingVectorJobError({
			message: 'Almost Useful account is not signed in',
			status: 401,
			code: 'unauthorized',
		});
	}

	const portalOrigin = resolveAlmostUsefulPortalOrigin();
	const vectorUrl = `${portalOrigin}${HANDWRITING_VECTOR_JOB_PATH}`;
	let status: number;
	let json: unknown;
	try {
		const response = await almostUsefulRequestJson({
			url: vectorUrl,
			method: 'POST',
			accessToken,
			body,
		});
		status = response.status;
		json = response.json;
	} catch {
		throw new HandwritingVectorJobError({
			message: 'Handwriting vector job failed',
			status: 0,
			code: null,
		});
	}

	if (options?.isCancelled?.()) {
		throw new HandwritingVectorJobError({
			message: 'Photo convert was cancelled',
			status: 0,
			code: 'cancelled',
		});
	}

	if (status < 200 || status >= 300) {
		throw handwritingVectorJobErrorFromResponse(status, json);
	}

	// Wrong host or a portal build without this route serves the HTML app shell (200, non-JSON).
	if (json === null) {
		throw new HandwritingVectorJobError({
			message:
				'Portal did not return JSON for handwriting-vector (check Custom URL and that the portal includes POST /api/jobs/handwriting-vector)',
			status,
			code: 'route_missing',
		});
	}

	const parsed = parseHandwritingVectorJobResponse(json);
	if (!parsed) {
		throw new HandwritingVectorJobError({
			message: 'Invalid handwriting vector response',
			status,
			code: 'parse_error',
		});
	}
	return parsed;
}

function parseHandwritingVectorJobResponse(json: unknown): HandwritingVectorJobResponse | null {
	if (!json || typeof json !== 'object') return null;
	const record = json as Record<string, unknown>;
	if (!Array.isArray(record.strokes)) return null;
	if (typeof record.model !== 'string') return null;
	if (record.mediaType !== 'image/jpeg') return null;
	const strokes: HandwritingVectorStroke[] = [];
	for (const rawStroke of record.strokes) {
		if (!rawStroke || typeof rawStroke !== 'object') return null;
		const pointsRaw = (rawStroke as { points?: unknown }).points;
		if (!Array.isArray(pointsRaw)) return null;
		const points: [number, number][] = [];
		for (const point of pointsRaw) {
			if (!Array.isArray(point) || point.length < 2) return null;
			const x = point[0];
			const y = point[1];
			if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
				return null;
			}
			points.push([x, y]);
		}
		if (points.length >= 2) strokes.push({ points });
	}
	if (strokes.length === 0) return null;
	const parsed: HandwritingVectorJobResponse = {
		strokes,
		model: record.model,
		mediaType: 'image/jpeg',
	};
	if (typeof record.remainingPercent === 'number') parsed.remainingPercent = record.remainingPercent;
	if (typeof record.costPercent === 'number') parsed.costPercent = record.costPercent;
	return parsed;
}

function handwritingVectorJobErrorFromResponse(status: number, json: unknown): HandwritingVectorJobError {
	const code = json && typeof json === 'object' && typeof (json as { code?: unknown }).code === 'string'
		? (json as { code: string }).code
		: null;
	const message = json && typeof json === 'object' && typeof (json as { error?: unknown }).error === 'string'
		? (json as { error: string }).error
		: `Handwriting vector job failed (${status})`;
	if (status === 402) {
		return new HandwritingVectorJobError({
			message: 'Insufficient Almost Useful credits',
			status,
			code: code ?? 'payment_required',
		});
	}
	return new HandwritingVectorJobError({ message, status, code });
}
