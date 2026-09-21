import { fetchLocally, saveLocally } from 'src/logic/utils/storage';

//////////
//////////

export const HANDWRITING_TRANSCRIPTION_QUEUE_STORAGE_SUFFIX = 'handwritingTranscriptionQueue_v2';

// Pending jobs and open editor sessions stay device-local (au_ink_*), not data.json,
// so Obsidian Sync does not replay transcription work on every device.
// v2 drops SimHash job snapshots; occupancy is bbox cell strings.

export type HandwritingTranscriptionFileType = 'inkWriting' | 'inkDrawing';
export type HandwritingTranscriptionJobReason = 'auto' | 'manual';

export interface HandwritingTranscriptionPendingJob {
	filePath: string;
	fileType: HandwritingTranscriptionFileType;
	reason: HandwritingTranscriptionJobReason;
	/** Live bbox occupancy at enqueue; empty on quit-promote until prune. */
	bboxCellsAtLastTranscription: string;
	enqueuedAt: string;
}

export interface HandwritingTranscriptionOpenSession {
	filePath: string;
	fileType: HandwritingTranscriptionFileType;
}

export interface HandwritingTranscriptionQueueBlobV2 {
	version: 2;
	pending: HandwritingTranscriptionPendingJob[];
	openSessions: HandwritingTranscriptionOpenSession[];
}

/**
 * Reads the device-local transcription queue. Corrupt JSON yields an empty blob.
 */
export function readHandwritingTranscriptionQueueBlob(): HandwritingTranscriptionQueueBlobV2 {
	const raw = fetchLocally(HANDWRITING_TRANSCRIPTION_QUEUE_STORAGE_SUFFIX);
	if (typeof raw !== 'string') return emptyQueueBlob();
	try {
		const parsedUnknown: unknown = JSON.parse(raw);
		if (!isQueueBlob(parsedUnknown)) return emptyQueueBlob();
		return parsedUnknown;
	} catch {
		return emptyQueueBlob();
	}
}

/**
 * Writes the device-local transcription queue (sync — safe on quit).
 */
export function writeHandwritingTranscriptionQueueBlob(
	blob: HandwritingTranscriptionQueueBlobV2,
): void {
	saveLocally(HANDWRITING_TRANSCRIPTION_QUEUE_STORAGE_SUFFIX, JSON.stringify(blob));
}

function emptyQueueBlob(): HandwritingTranscriptionQueueBlobV2 {
	return {
		version: 2,
		pending: [],
		openSessions: [],
	};
}

function isQueueBlob(value: unknown): value is HandwritingTranscriptionQueueBlobV2 {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	if (record.version !== 2) return false;
	if (!Array.isArray(record.pending) || !Array.isArray(record.openSessions)) return false;
	return record.pending.every(isPendingJob) && record.openSessions.every(isOpenSession);
}

function isPendingJob(value: unknown): value is HandwritingTranscriptionPendingJob {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	const isFileType = record.fileType === 'inkWriting' || record.fileType === 'inkDrawing';
	const isReason = record.reason === 'auto' || record.reason === 'manual';
	return (
		typeof record.filePath === 'string'
		&& isFileType
		&& isReason
		&& typeof record.bboxCellsAtLastTranscription === 'string'
		&& typeof record.enqueuedAt === 'string'
	);
}

function isOpenSession(value: unknown): value is HandwritingTranscriptionOpenSession {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	const isFileType = record.fileType === 'inkWriting' || record.fileType === 'inkDrawing';
	return typeof record.filePath === 'string' && isFileType;
}
