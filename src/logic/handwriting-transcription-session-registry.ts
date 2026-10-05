import type { HandwritingTranscriptionFileType } from 'src/logic/handwriting-transcription-queue-store';

//////////
//////////

export interface HandwritingTranscriptionSession {
	filePath: string;
	fileType: HandwritingTranscriptionFileType;
	saveAndHalt: () => void | Promise<void>;
	onTranscriptApplied?: (transcript: string) => void;
}

interface SessionSlot {
	refcount: number;
	session: HandwritingTranscriptionSession;
}

const sessionsByFilePath = new Map<string, SessionSlot>();

/**
 * Registers an unlocked embed or dedicated editor. Refcount allows the same SVG
 * in two places. Returns the new refcount.
 */
export function registerHandwritingTranscriptionSession(
	session: HandwritingTranscriptionSession,
): number {
	const existing = sessionsByFilePath.get(session.filePath);
	if (existing) {
		existing.refcount += 1;
		existing.session = session;
		return existing.refcount;
	}
	sessionsByFilePath.set(session.filePath, { refcount: 1, session });
	return 1;
}

/**
 * Updates session callbacks without bumping refcount (e.g. ink canvas re-ready).
 */
export function replaceHandwritingTranscriptionSession(
	session: HandwritingTranscriptionSession,
): void {
	const existing = sessionsByFilePath.get(session.filePath);
	if (existing) {
		existing.session = session;
		return;
	}
	sessionsByFilePath.set(session.filePath, { refcount: 1, session });
}

/**
 * Drops one registration for the file. Returns remaining refcount (0 if gone).
 */
export function unregisterHandwritingTranscriptionSession(filePath: string): number {
	const existing = sessionsByFilePath.get(filePath);
	if (!existing) return 0;
	existing.refcount -= 1;
	if (existing.refcount > 0) return existing.refcount;
	sessionsByFilePath.delete(filePath);
	return 0;
}

/**
 * Returns the live session for a writing/drawing file, if any.
 */
export function getHandwritingTranscriptionSession(
	filePath: string,
): HandwritingTranscriptionSession | undefined {
	return sessionsByFilePath.get(filePath)?.session;
}

/**
 * Snapshot of every open writing/drawing editor (for quit-as-lock).
 */
export function listHandwritingTranscriptionSessions(): HandwritingTranscriptionSession[] {
	return [...sessionsByFilePath.values()].map((slot) => slot.session);
}

/**
 * True while the user is editing this SVG in an embed or dedicated view.
 */
export function isHandwritingTranscriptionSessionOpen(filePath: string): boolean {
	return sessionsByFilePath.has(filePath);
}
