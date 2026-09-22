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

/**
 * A finished portal result whose note/SVG write is waiting until that file's editor closes.
 * `bboxCellsAtLastTranscription` is the ink that was sent, not strokes added while editing.
 */
export interface HandwritingTranscriptionHeldResult {
	filePath: string;
	fileType: HandwritingTranscriptionFileType;
	transcript: string;
	bboxCellsAtLastTranscription: string;
	lastTranscriptionAt: string;
}

export interface HandwritingTranscriptionQueueBlobV2 {
	version: 2;
	pending: HandwritingTranscriptionPendingJob[];
	openSessions: HandwritingTranscriptionOpenSession[];
	/** Missing on blobs written before held results existed; readers treat that as empty. */
	heldTranscripts: HandwritingTranscriptionHeldResult[];
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
		// Field was added after v2 shipped. Absence must not wipe pending jobs.
		parsedUnknown.heldTranscripts = normalizeHeldTranscripts(parsedUnknown.heldTranscripts);
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
		heldTranscripts: [],
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

/**
 * Drops invalid held entries. A bad entry must not fail the whole queue blob.
 */
function normalizeHeldTranscripts(value: unknown): HandwritingTranscriptionHeldResult[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isHeldResult);
}

function isHeldResult(value: unknown): value is HandwritingTranscriptionHeldResult {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	const isFileType = record.fileType === 'inkWriting' || record.fileType === 'inkDrawing';
	return (
		typeof record.filePath === 'string'
		&& isFileType
		&& typeof record.transcript === 'string'
		&& typeof record.bboxCellsAtLastTranscription === 'string'
		&& typeof record.lastTranscriptionAt === 'string'
	);
}

function isOpenSession(value: unknown): value is HandwritingTranscriptionOpenSession {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	const isFileType = record.fileType === 'inkWriting' || record.fileType === 'inkDrawing';
	return typeof record.filePath === 'string' && isFileType;
}
