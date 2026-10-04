import { Notice, TFile } from 'obsidian';
import InkPlugin from 'src/main';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { transcribeWriting } from 'src/logic/transcribe-writing';
import { saveWriteFileTranscript } from 'src/components/formats/current/utils/needsTranscriptUpdate';
import {
	inkChangeMeetsAutoTranscribeThreshold,
	inkFileHasStrokes,
	serializeBboxCellsAtLastTranscription,
} from 'src/logic/stroke-bbox-cells';
import { patchInkEmbedTranscriptAltsInVault } from 'src/logic/handwriting-transcription-apply';
import { subscribeAlmostUsefulSessionChanged, readAlmostUsefulSession } from 'src/logic/almostuseful/almostuseful-session';
import {
	HandwritingTranscriptionJobError,
	handwritingTranscriptionNoticeForError,
} from 'src/logic/almostuseful/almostuseful-handwriting-transcription';
import {
	listHandwritingTranscriptionSessions,
	getHandwritingTranscriptionSession,
	isHandwritingTranscriptionSessionOpen,
	registerHandwritingTranscriptionSession,
	unregisterHandwritingTranscriptionSession,
	replaceHandwritingTranscriptionSession,
	type HandwritingTranscriptionSession,
} from 'src/logic/handwriting-transcription-session-registry';
import {
	readHandwritingTranscriptionQueueBlob,
	writeHandwritingTranscriptionQueueBlob,
	type HandwritingTranscriptionFileType,
	type HandwritingTranscriptionPendingJob,
	type HandwritingTranscriptionOpenSession,
	type HandwritingTranscriptionHeldResult,
	type HandwritingTranscriptionTerminalRejection,
} from 'src/logic/handwriting-transcription-queue-store';

//////////
//////////

const LAUNCH_RESUME_GRACE_MS = 5000;
const RETRY_DELAY_MS = 30_000;
const NETWORK_FAILURE_NOTICE_THRESHOLD = 5;
const HANDWRITING_TRANSCRIPTION_QUEUE_CHANGED_EVENT = 'ddc-ink-handwriting-transcription-queue-changed';

// Plugin-owned serial worker: survives embed unmount and Obsidian quit. React/widgets
// only register sessions and call enqueueAuto / enqueueManualTranscription.

let queuePlugin: InkPlugin | null = null;
let inflightJob: HandwritingTranscriptionPendingJob | null = null;
let isWorkerRunning = false;
let isStopped = false;
let launchGraceTimerId: number | null = null;
let retryKickTimerId: number | null = null;
let unsubscribeSessionChanged: (() => void) | null = null;
/** One notice per file for a retryable failure, until a later attempt succeeds. */
const retryNoticeShownForPath = new Set<string>();
/** User removed an in-flight job from the queue; discard its result when the POST returns. */
const userCancelledInflightPaths = new Set<string>();

export interface HandwritingTranscriptionQueueSnapshotItem {
	filePath: string;
	fileType: HandwritingTranscriptionFileType;
	reason: HandwritingTranscriptionPendingJob['reason'];
	isProcessing: boolean;
}

export type HandwritingTranscriptionQueueFileStatus = 'processing' | 'queued';

// Settings Transcription Queue card repaints from this event; localStorage has no cross-tab listener.
function notifyHandwritingTranscriptionQueueChanged(): void {
	window.dispatchEvent(new CustomEvent(HANDWRITING_TRANSCRIPTION_QUEUE_CHANGED_EVENT));
}

/**
 * Pending jobs plus the active worker job, in run order (processing first).
 */
export function readHandwritingTranscriptionQueueSnapshot(): HandwritingTranscriptionQueueSnapshotItem[] {
	const pending = readHandwritingTranscriptionQueueBlob().pending;
	const snapshot: HandwritingTranscriptionQueueSnapshotItem[] = [];
	if (inflightJob) {
		snapshot.push({
			filePath: inflightJob.filePath,
			fileType: inflightJob.fileType,
			reason: inflightJob.reason,
			isProcessing: true,
		});
	}
	for (const job of pending) {
		if (inflightJob && inflightJob.filePath === job.filePath) continue;
		snapshot.push({
			filePath: job.filePath,
			fileType: job.fileType,
			reason: job.reason,
			isProcessing: false,
		});
	}
	return snapshot;
}

/** Whether one ink file is actively transcribing or waiting in the serial queue. */
export function getHandwritingTranscriptionQueueStatusForFile(
	filePath: string,
): HandwritingTranscriptionQueueFileStatus | null {
	const queueItem = readHandwritingTranscriptionQueueSnapshot().find(
		(item) => item.filePath === filePath,
	);
	if (!queueItem) return null;
	if (queueItem.isProcessing) return 'processing';
	return 'queued';
}

/** Same-tab queue updates; storage listeners are not needed (queue is in-memory + localStorage writes). */
export function subscribeHandwritingTranscriptionQueueChanged(onChange: () => void): () => void {
	const handler = () => {
		onChange();
	};
	window.addEventListener(HANDWRITING_TRANSCRIPTION_QUEUE_CHANGED_EVENT, handler);
	return () => {
		window.removeEventListener(HANDWRITING_TRANSCRIPTION_QUEUE_CHANGED_EVENT, handler);
	};
}

/**
 * Removes one file from the waiting list, or marks the in-flight job to discard its result.
 */
export function removeHandwritingTranscriptionFromQueue(filePath: string): void {
	dequeueHandwritingTranscriptionJob(filePath);
	if (inflightJob?.filePath === filePath) {
		userCancelledInflightPaths.add(filePath);
	}
	notifyHandwritingTranscriptionQueueChanged();
}

/** Clears every waiting job and discards any in-flight transcription result. */
export function clearHandwritingTranscriptionQueue(): void {
	const blob = readHandwritingTranscriptionQueueBlob();
	blob.pending = [];
	writeHandwritingTranscriptionQueueBlob(blob);
	if (inflightJob) {
		userCancelledInflightPaths.add(inflightJob.filePath);
	}
	notifyHandwritingTranscriptionQueueChanged();
}

export interface EnqueueManualTranscriptionOptions {
	file: TFile;
	fileType: HandwritingTranscriptionFileType;
	svgFileContent: string;
}

/**
 * Binds the serial worker to the plugin. Call after setGlobals in onload.
 */
export function initHandwritingTranscriptionQueue(plugin: InkPlugin): void {
	queuePlugin = plugin;
	isStopped = false;
	unsubscribeSessionChanged?.();
	unsubscribeSessionChanged = subscribeAlmostUsefulSessionChanged(() => {
		if (!hasLinkedAlmostUsefulAccount()) {
			// Unsigned devices must not retain pending jobs — enqueue paths are gated too.
			clearHandwritingTranscriptionQueue();
			return;
		}
		kickHandwritingTranscriptionQueue();
	});
	plugin.registerDomEvent(window, 'beforeunload', () => {
		promoteOpenSessionsToPendingOnQuit();
	});
	plugin.registerDomEvent(window, 'online', () => {
		kickHandwritingTranscriptionQueue();
	});
	plugin.registerEvent(
		// Sync/external edits: enqueueAuto respects openSessions so embed autosave does not loop.
		plugin.app.vault.on('modify', (file) => {
			if (!(file instanceof TFile)) return;
			if (!file.path.toLowerCase().endsWith('.svg')) return;
			if (isHandwritingTranscriptionSessionOpen(file.path)) return;
			void enqueueAuto(file.path);
		}),
	);
	resumeHandwritingTranscriptionQueueOnLaunch();
}

/**
 * Stops the worker and promotes open editors into pending (sync for quit).
 */
export function shutdownHandwritingTranscriptionQueue(): void {
	isStopped = true;
	if (launchGraceTimerId !== null) {
		window.clearTimeout(launchGraceTimerId);
		launchGraceTimerId = null;
	}
	if (retryKickTimerId !== null) {
		window.clearTimeout(retryKickTimerId);
		retryKickTimerId = null;
	}
	unsubscribeSessionChanged?.();
	unsubscribeSessionChanged = null;
	for (const session of listHandwritingTranscriptionSessions()) {
		void session.saveAndHalt();
	}
	promoteOpenSessionsToPendingOnQuit();
	inflightJob = null;
	isWorkerRunning = false;
	queuePlugin = null;
}

/**
 * Removes a file from the waiting list (user started editing).
 */
export function dequeueHandwritingTranscriptionJob(filePath: string): void {
	const blob = readHandwritingTranscriptionQueueBlob();
	const hadJob = blob.pending.some((job) => job.filePath === filePath);
	blob.pending = blob.pending.filter((job) => job.filePath !== filePath);
	writeHandwritingTranscriptionQueueBlob(blob);
	if (hadJob) notifyHandwritingTranscriptionQueueChanged();
}

/**
 * Drops waiting auto jobs when the user turns off auto-transcribe for a type.
 */
export function dropWaitingAutoTranscriptionJobsForFileType(
	fileType: HandwritingTranscriptionFileType,
): void {
	const blob = readHandwritingTranscriptionQueueBlob();
	const previousCount = blob.pending.length;
	blob.pending = blob.pending.filter((job) => {
		if (job.reason !== 'auto') return true;
		return job.fileType !== fileType;
	});
	writeHandwritingTranscriptionQueueBlob(blob);
	if (blob.pending.length !== previousCount) notifyHandwritingTranscriptionQueueChanged();
}

/**
 * Registers an open writing/drawing editor, dequeues pending work, and persists openSessions.
 */
export function registerTranscriptionEditorSession(
	session: HandwritingTranscriptionSession,
): void {
	registerHandwritingTranscriptionSession(session);
	dequeueHandwritingTranscriptionJob(session.filePath);
	syncPersistedOpenTranscriptionSessions();
}

/**
 * Unregisters an open writing/drawing editor and persists openSessions.
 * The last drop writes any held transcript before the usual threshold check.
 */
export async function unregisterTranscriptionEditorSession(filePath: string): Promise<void> {
	const remainingRefcount = unregisterHandwritingTranscriptionSession(filePath);
	syncPersistedOpenTranscriptionSessions();
	if (remainingRefcount === 0) {
		// completeSave has already run. Land the in-flight result before enqueueAuto
		// fingerprints disk, so strokes added while editing can still queue a new job.
		await applyHeldTranscriptIfPresent(filePath);
		await enqueueAuto(filePath);
	}
	kickHandwritingTranscriptionQueue();
}

/**
 * Refreshes session callbacks when the same editor re-initializes without bumping refcount.
 */
export function replaceTranscriptionEditorSession(
	session: HandwritingTranscriptionSession,
): void {
	replaceHandwritingTranscriptionSession(session);
}

/**
 * Auto-enqueue after lock/close/quit/sync. Honours per-type toggle, empty canvas, and change threshold.
 */
export async function enqueueAuto(filePath: string): Promise<void> {
	const plugin = queuePlugin;
	if (!plugin) return;
	// Auto paths are silent when unsigned; manual enqueue shows a notice in its own entry point.
	if (!hasLinkedAlmostUsefulAccount()) return;
	const file = plugin.app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return;
	const svgFileContent = await plugin.app.vault.read(file);
	const pageData = extractInkJsonFromSvg(svgFileContent);
	if (!pageData) return;
	const fileType = pageData.meta.fileType;
	if (fileType !== 'inkWriting' && fileType !== 'inkDrawing') return;
	if (!isAutoTranscribeEnabled(plugin, fileType)) return;
	if (!inkFileHasStrokes(pageData)) return;
	const liveBboxCells = serializeBboxCellsAtLastTranscription(pageData);
	dropStaleTerminalRejections(filePath, liveBboxCells);
	if (matchingTerminalRejection(filePath, liveBboxCells)) {
		// Same strokes already refused. A later close must not POST again.
		return;
	}
	const storedBboxCells = pageData.meta.bboxCellsAtLastTranscription;
	const thresholdPercent = getAutoTranscribeChangeThresholdPercent(plugin, fileType);
	const meetsThreshold = inkChangeMeetsAutoTranscribeThreshold(
		thresholdPercent,
		storedBboxCells,
		pageData,
	);
	if (!meetsThreshold) {
		return;
	}
	const pendingJob: HandwritingTranscriptionPendingJob = {
		filePath,
		fileType,
		reason: 'auto',
		bboxCellsAtLastTranscription: liveBboxCells,
		enqueuedAt: new Date().toISOString(),
	};
	if (shouldSkipEnqueueBecauseInflightUnchanged(pendingJob)) {
		return;
	}
	upsertPendingJob(pendingJob);
	kickHandwritingTranscriptionQueue();
}

/**
 * Manual overflow Transcribe — never gated by auto-close toggles; jumps the waiting list.
 */
export async function enqueueManualTranscription(
	options: EnqueueManualTranscriptionOptions,
): Promise<void> {
	if (!hasLinkedAlmostUsefulAccount()) {
		new Notice('Transcription requires an Almost Useful account. Link your account in Ink\'s settings.');
		return;
	}
	const pageData = extractInkJsonFromSvg(options.svgFileContent);
	if (!pageData) {
		new Notice('Could not read ink file for transcription');
		return;
	}
	if (!inkFileHasStrokes(pageData)) {
		new Notice('Nothing to transcribe');
		return;
	}
	const liveBboxCells = serializeBboxCellsAtLastTranscription(pageData);
	dropStaleTerminalRejections(options.file.path, liveBboxCells);
	const blocked = matchingTerminalRejection(options.file.path, liveBboxCells);
	if (blocked) {
		new Notice(blocked.notice);
		return;
	}
	const pendingJob: HandwritingTranscriptionPendingJob = {
		filePath: options.file.path,
		fileType: options.fileType,
		reason: 'manual',
		bboxCellsAtLastTranscription: liveBboxCells,
		enqueuedAt: new Date().toISOString(),
	};
	if (shouldSkipEnqueueBecauseInflightUnchanged(pendingJob)) {
		new Notice('Transcription already in progress for this file');
		return;
	}
	upsertPendingJob(pendingJob, { svgFileContent: options.svgFileContent, promoteManual: true });
	if (inflightJob && inflightJob.filePath !== options.file.path) {
		new Notice('Transcription will start when the current job finishes');
	}
	kickHandwritingTranscriptionQueue();
}

const manualSvgByPath = new Map<string, string>();

function upsertPendingJob(
	job: HandwritingTranscriptionPendingJob,
	options?: { svgFileContent?: string; promoteManual?: boolean },
): void {
	if (options?.svgFileContent) {
		manualSvgByPath.set(job.filePath, options.svgFileContent);
	}
	const blob = readHandwritingTranscriptionQueueBlob();
	const existingIndex = blob.pending.findIndex((pending) => pending.filePath === job.filePath);
	if (existingIndex >= 0) {
		const existing = blob.pending[existingIndex];
		let reason = existing.reason;
		if (job.reason === 'manual' || options?.promoteManual) {
			reason = 'manual';
		}
		blob.pending.splice(existingIndex, 1);
		const merged: HandwritingTranscriptionPendingJob = {
			...existing,
			...job,
			reason,
		};
		// A fresh enqueue should run now, not wait out a previous retry delay or failure streak.
		delete merged.retryAfter;
		delete merged.networkFailureCount;
		if (reason === 'manual') {
			blob.pending.unshift(merged);
		} else {
			blob.pending.push(merged);
		}
	} else if (job.reason === 'manual') {
		blob.pending.unshift(job);
	} else {
		blob.pending.push(job);
	}
	writeHandwritingTranscriptionQueueBlob(blob);
	notifyHandwritingTranscriptionQueueChanged();
}

function persistOpenSessionsList(openSessions: HandwritingTranscriptionOpenSession[]): void {
	const blob = readHandwritingTranscriptionQueueBlob();
	blob.openSessions = openSessions;
	writeHandwritingTranscriptionQueueBlob(blob);
}

/**
 * Syncs openSessions in localStorage from the live registry (register/unregister).
 */
export function syncPersistedOpenTranscriptionSessions(): void {
	const openSessions = listHandwritingTranscriptionSessions().map((session) => ({
		filePath: session.filePath,
		fileType: session.fileType,
	}));
	persistOpenSessionsList(openSessions);
}

function promoteOpenSessionsToPendingOnQuit(): void {
	const plugin = queuePlugin;
	if (!hasLinkedAlmostUsefulAccount()) return;
	const blob = readHandwritingTranscriptionQueueBlob();
	const seen = new Set(blob.pending.map((job) => job.filePath));
	for (const session of blob.openSessions) {
		if (plugin && !isAutoTranscribeEnabled(plugin, session.fileType)) continue;
		if (seen.has(session.filePath)) continue;
		seen.add(session.filePath);
		blob.pending.push({
			filePath: session.filePath,
			fileType: session.fileType,
			reason: 'auto',
			bboxCellsAtLastTranscription: '',
			enqueuedAt: new Date().toISOString(),
		});
	}
	blob.openSessions = [];
	writeHandwritingTranscriptionQueueBlob(blob);
}

function resumeHandwritingTranscriptionQueueOnLaunch(): void {
	const plugin = queuePlugin;
	if (!plugin) return;
	// Finished results held across quit must be on disk before prune's threshold check.
	void applyReadyHeldTranscripts().then(() => {
		if (isStopped) return;
		resumePendingJobsAfterHeldTranscripts(plugin);
	});
}

/**
 * Turns leftover open sessions into pending jobs, then prunes and kicks.
 */
function resumePendingJobsAfterHeldTranscripts(plugin: InkPlugin): void {
	if (!hasLinkedAlmostUsefulAccount()) return;
	const blob = readHandwritingTranscriptionQueueBlob();
	for (const session of blob.openSessions) {
		if (!isAutoTranscribeEnabled(plugin, session.fileType)) continue;
		const alreadyPending = blob.pending.some((job) => job.filePath === session.filePath);
		if (alreadyPending) continue;
		blob.pending.push({
			filePath: session.filePath,
			fileType: session.fileType,
			reason: 'auto',
			bboxCellsAtLastTranscription: '',
			enqueuedAt: new Date().toISOString(),
		});
	}
	blob.openSessions = [];
	writeHandwritingTranscriptionQueueBlob(blob);
	void pruneUnrunnablePendingJobs().then(() => {
		if (isStopped) return;
		const runnableCount = readHandwritingTranscriptionQueueBlob().pending.length;
		if (runnableCount === 0) return;
		const fileWord = runnableCount === 1 ? 'file' : 'files';
		new Notice(`Resuming handwriting transcription (${runnableCount} ${fileWord})`);
		launchGraceTimerId = window.setTimeout(() => {
			launchGraceTimerId = null;
			kickHandwritingTranscriptionQueue();
		}, LAUNCH_RESUME_GRACE_MS);
		plugin.register(() => {
			if (launchGraceTimerId !== null) {
				window.clearTimeout(launchGraceTimerId);
				launchGraceTimerId = null;
			}
		});
	});
}

async function pruneUnrunnablePendingJobs(): Promise<void> {
	const plugin = queuePlugin;
	if (!plugin) return;
	if (!hasLinkedAlmostUsefulAccount()) {
		const blob = readHandwritingTranscriptionQueueBlob();
		if (blob.pending.length > 0) {
			blob.pending = [];
			writeHandwritingTranscriptionQueueBlob(blob);
			notifyHandwritingTranscriptionQueueChanged();
		}
		return;
	}
	const blob = readHandwritingTranscriptionQueueBlob();
	const kept: HandwritingTranscriptionPendingJob[] = [];
	for (const job of blob.pending) {
		if (job.reason === 'auto' && !isAutoTranscribeEnabled(plugin, job.fileType)) continue;
		const file = plugin.app.vault.getAbstractFileByPath(job.filePath);
		if (!(file instanceof TFile)) continue;
		try {
			const svgFileContent = await plugin.app.vault.read(file);
			const pageData = extractInkJsonFromSvg(svgFileContent);
			if (!pageData) continue;
			if (!inkFileHasStrokes(pageData)) continue;
			const liveBboxCells = serializeBboxCellsAtLastTranscription(pageData);
			if (
				job.reason === 'auto'
				&& !inkChangeMeetsAutoTranscribeThreshold(
					getAutoTranscribeChangeThresholdPercent(plugin, job.fileType),
					pageData.meta.bboxCellsAtLastTranscription,
					pageData,
				)
			) {
				continue;
			}
			kept.push({
				...job,
				bboxCellsAtLastTranscription: liveBboxCells,
				fileType: pageData.meta.fileType === 'inkDrawing' ? 'inkDrawing' : 'inkWriting',
			});
		} catch {
			// Skip unreadable
		}
	}
	blob.pending = kept;
	writeHandwritingTranscriptionQueueBlob(blob);
}

/**
 * True when a retryable failure asked this job to wait.
 */
function isPendingJobWaitingForRetry(
	job: HandwritingTranscriptionPendingJob,
	nowMs: number,
): boolean {
	if (!job.retryAfter) return false;
	const retryAtMs = Date.parse(job.retryAfter);
	if (Number.isNaN(retryAtMs)) return false;
	return retryAtMs > nowMs;
}

/**
 * Wakes the worker when the soonest delayed retry is due. Other files can run first.
 */
function scheduleDelayedRetryKick(
	pending: HandwritingTranscriptionPendingJob[],
	nowMs: number,
): void {
	if (retryKickTimerId !== null) {
		window.clearTimeout(retryKickTimerId);
		retryKickTimerId = null;
	}
	let earliestRetryAtMs = Number.POSITIVE_INFINITY;
	for (const job of pending) {
		if (!job.retryAfter) continue;
		const retryAtMs = Date.parse(job.retryAfter);
		if (Number.isNaN(retryAtMs)) continue;
		if (retryAtMs > nowMs && retryAtMs < earliestRetryAtMs) {
			earliestRetryAtMs = retryAtMs;
		}
	}
	if (!Number.isFinite(earliestRetryAtMs)) return;
	const delayMs = Math.max(0, earliestRetryAtMs - nowMs);
	retryKickTimerId = window.setTimeout(() => {
		retryKickTimerId = null;
		kickHandwritingTranscriptionQueue();
	}, delayMs);
}

/**
 * True when the browser reports no local network link (Wi‑Fi/cellular off).
 */
function isDeviceNetworkOnline(): boolean {
	if (typeof navigator === 'undefined') return true;
	return navigator.onLine;
}

/**
 * True for requestUrl throws — no HTTP status or portal code.
 */
function isTransientNetworkJobError(error: HandwritingTranscriptionJobError): boolean {
	return error.status === 0 && error.code === null;
}

/**
 * Network throws have no portal code. Those stay retryable so a blip does not drop the file.
 */
function asHandwritingTranscriptionJobError(error: unknown): HandwritingTranscriptionJobError {
	if (error instanceof HandwritingTranscriptionJobError) return error;
	const message = error instanceof Error ? error.message : 'Handwriting transcription failed';
	return new HandwritingTranscriptionJobError({
		message,
		status: 0,
		code: null,
		retryable: true,
	});
}

/**
 * Shows a retryable failure once per file until a later attempt succeeds.
 */
function showRetryableNoticeOnce(filePath: string, message: string): void {
	if (retryNoticeShownForPath.has(filePath)) return;
	retryNoticeShownForPath.add(filePath);
	new Notice(message);
}

/**
 * Puts a job back in the waiting list. Used for offline deferral and retryable failures.
 */
function requeuePendingJob(
	job: HandwritingTranscriptionPendingJob,
	options?: { retryAfterMs?: number; atFront?: boolean },
): void {
	if (!hasLinkedAlmostUsefulAccount()) return;
	const blob = readHandwritingTranscriptionQueueBlob();
	const alreadyQueued = blob.pending.some((pending) => pending.filePath === job.filePath);
	if (alreadyQueued) return;
	const requeued: HandwritingTranscriptionPendingJob = { ...job };
	if (options?.retryAfterMs !== undefined) {
		requeued.retryAfter = new Date(Date.now() + options.retryAfterMs).toISOString();
	} else {
		delete requeued.retryAfter;
	}
	if (options?.atFront) blob.pending.unshift(requeued);
	else blob.pending.push(requeued);
	writeHandwritingTranscriptionQueueBlob(blob);
	notifyHandwritingTranscriptionQueueChanged();
}

/**
 * Puts a retryable job back with a delay so the worker can run other files first.
 */
function requeueRetryableJob(job: HandwritingTranscriptionPendingJob): void {
	requeuePendingJob(job, { retryAfterMs: RETRY_DELAY_MS });
}

/**
 * File-shaped refusals stick to the strokes. Credits and sign-in do not.
 */
function shouldRememberTerminalRejection(error: HandwritingTranscriptionJobError): boolean {
	if (error.retryable) return false;
	if (error.code === 'payment_required' || error.code === 'unauthorized') {
		// Buying credits or signing in again can succeed without new strokes.
		return false;
	}
	if (error.status === 401 || error.status === 402) return false;
	return true;
}

/**
 * Remembers a portal refusal for these strokes so close/modify does not POST again.
 */
function rememberTerminalRejection(
	filePath: string,
	bboxCellsAtLastTranscription: string,
	error: HandwritingTranscriptionJobError,
	notice: string,
): void {
	if (!shouldRememberTerminalRejection(error)) return;
	const code = error.code ?? 'invalid_request';
	const blob = readHandwritingTranscriptionQueueBlob();
	const next = blob.terminalRejections.filter((rejection) => rejection.filePath !== filePath);
	const remembered: HandwritingTranscriptionTerminalRejection = {
		filePath,
		bboxCellsAtLastTranscription,
		code,
		notice,
	};
	next.push(remembered);
	blob.terminalRejections = next;
	writeHandwritingTranscriptionQueueBlob(blob);
}

/**
 * Drops a stored refusal when the strokes no longer match it.
 */
function dropStaleTerminalRejections(filePath: string, liveBboxCells: string): void {
	const blob = readHandwritingTranscriptionQueueBlob();
	const next = blob.terminalRejections.filter((rejection) => {
		if (rejection.filePath !== filePath) return true;
		return rejection.bboxCellsAtLastTranscription === liveBboxCells;
	});
	if (next.length === blob.terminalRejections.length) return;
	blob.terminalRejections = next;
	writeHandwritingTranscriptionQueueBlob(blob);
}

/**
 * Returns the refusal stored for this file's current strokes, if any.
 */
function matchingTerminalRejection(
	filePath: string,
	liveBboxCells: string,
): HandwritingTranscriptionTerminalRejection | null {
	const match = readHandwritingTranscriptionQueueBlob().terminalRejections.find((rejection) => {
		const isSameFile = rejection.filePath === filePath;
		const isSameStrokes = rejection.bboxCellsAtLastTranscription === liveBboxCells;
		return isSameFile && isSameStrokes;
	});
	return match ?? null;
}

/**
 * Clears retry notices and stroke refusals after a transcription succeeds.
 */
function clearTranscriptionFailureState(filePath: string): void {
	retryNoticeShownForPath.delete(filePath);
	const blob = readHandwritingTranscriptionQueueBlob();
	const next = blob.terminalRejections.filter((rejection) => rejection.filePath !== filePath);
	if (next.length === blob.terminalRejections.length) return;
	blob.terminalRejections = next;
	writeHandwritingTranscriptionQueueBlob(blob);
}

/**
 * Starts the next waiting job if the worker is idle and signed in.
 */
export function kickHandwritingTranscriptionQueue(): void {
	if (isStopped || isWorkerRunning) return;
	if (launchGraceTimerId !== null) return;
	if (!hasLinkedAlmostUsefulAccount()) return;
	if (!isDeviceNetworkOnline()) {
		// Jobs stay pending with no retry timer. The window "online" listener kicks again.
		return;
	}
	const blob = readHandwritingTranscriptionQueueBlob();
	const nowMs = Date.now();
	const nextJobIndex = blob.pending.findIndex((job) => {
		if (isPendingJobWaitingForRetry(job, nowMs)) return false;
		if (job.reason !== 'auto') return true;
		return !getHandwritingTranscriptionSession(job.filePath);
	});
	if (nextJobIndex < 0) {
		scheduleDelayedRetryKick(blob.pending, nowMs);
		return;
	}
	const nextJob = blob.pending[nextJobIndex];
	blob.pending.splice(nextJobIndex, 1);
	writeHandwritingTranscriptionQueueBlob(blob);
	scheduleDelayedRetryKick(blob.pending, nowMs);
	// Notify only after runTranscriptionJob marks this file in-flight. A notify here
	// would drop it from pending before inflightJob is set, so a visible embed would
	// read "not in the queue" and never show the spinner.
	void runTranscriptionJob(nextJob);
}

/**
 * Same file already POSTing: skip a follow-up unless bbox occupancy changed.
 */
function shouldSkipEnqueueBecauseInflightUnchanged(
	job: HandwritingTranscriptionPendingJob,
): boolean {
	if (!inflightJob || inflightJob.filePath !== job.filePath) return false;
	if (!inflightJob.bboxCellsAtLastTranscription || !job.bboxCellsAtLastTranscription) return false;
	return inflightJob.bboxCellsAtLastTranscription === job.bboxCellsAtLastTranscription;
}

/** Transcription jobs require a linked Almost Useful app-token session on this device. */
function hasLinkedAlmostUsefulAccount(): boolean {
	return !!readAlmostUsefulSession()?.accessToken;
}

function isAutoTranscribeEnabled(
	plugin: InkPlugin,
	fileType: HandwritingTranscriptionFileType,
): boolean {
	if (fileType === 'inkWriting') return plugin.settings.writingAutoTranscribeOnClose;
	return plugin.settings.drawingAutoTranscribeOnClose;
}

function getAutoTranscribeChangeThresholdPercent(
	plugin: InkPlugin,
	fileType: HandwritingTranscriptionFileType,
): number {
	if (fileType === 'inkWriting') {
		return plugin.settings.writingAutoTranscribeChangeThresholdPercent;
	}
	return plugin.settings.drawingAutoTranscribeChangeThresholdPercent;
}

async function runTranscriptionJob(job: HandwritingTranscriptionPendingJob): Promise<void> {
	isWorkerRunning = true;
	inflightJob = job;
	notifyHandwritingTranscriptionQueueChanged();
	let shouldDeferKickBecauseEditorOpen = false;
	let rejectionBboxCells = job.bboxCellsAtLastTranscription;
	try {
		if (userCancelledInflightPaths.has(job.filePath)) return;
		const plugin = queuePlugin;
		if (!plugin) {
			const blob = readHandwritingTranscriptionQueueBlob();
			if (!blob.pending.some((pending) => pending.filePath === job.filePath)) {
				blob.pending.unshift(job);
				writeHandwritingTranscriptionQueueBlob(blob);
			}
			return;
		}
		const file = plugin.app.vault.getAbstractFileByPath(job.filePath);
		if (!(file instanceof TFile)) return;
		if (getHandwritingTranscriptionSession(job.filePath) && job.reason === 'auto') {
			// User is still in the editor (lock unmount is async). Put the job back and wait.
			const blob = readHandwritingTranscriptionQueueBlob();
			if (!blob.pending.some((pending) => pending.filePath === job.filePath)) {
				blob.pending.unshift(job);
				writeHandwritingTranscriptionQueueBlob(blob);
			}
			shouldDeferKickBecauseEditorOpen = true;
			return;
		}
		const queuedSvg = manualSvgByPath.get(job.filePath);
		manualSvgByPath.delete(job.filePath);
		const svgFileContent = queuedSvg ?? await plugin.app.vault.read(file);
		const pageData = extractInkJsonFromSvg(svgFileContent);
		if (!pageData) return;
		if (!inkFileHasStrokes(pageData)) return;
		const liveBboxCells = serializeBboxCellsAtLastTranscription(pageData);
		rejectionBboxCells = liveBboxCells;
		if (job.bboxCellsAtLastTranscription && job.bboxCellsAtLastTranscription !== liveBboxCells) {
			if (job.reason === 'auto') {
				await enqueueAuto(job.filePath);
			}
			return;
		}
		if (
			job.reason === 'auto'
			&& !inkChangeMeetsAutoTranscribeThreshold(
				getAutoTranscribeChangeThresholdPercent(plugin, job.fileType),
				pageData.meta.bboxCellsAtLastTranscription,
				pageData,
			)
		) {
			return;
		}
		if (!isDeviceNetworkOnline()) {
			// Already dequeued. Front of the list, no retryAfter, so coming online runs it next.
			requeuePendingJob(job, { atFront: true });
			return;
		}
		const transcript = await transcribeWriting(svgFileContent);
		if (userCancelledInflightPaths.has(job.filePath)) return;
		const lastTranscriptionAt = new Date().toISOString();
		clearTranscriptionFailureState(job.filePath);
		const heldResult: HandwritingTranscriptionHeldResult = {
			filePath: job.filePath,
			fileType: job.fileType,
			transcript,
			bboxCellsAtLastTranscription: liveBboxCells,
			lastTranscriptionAt,
		};
		if (isStopped) {
			// Quit cannot finish the note edit. Keep the paid result for the next launch.
			if (getHandwritingTranscriptionSession(job.filePath)) {
				rememberHeldTranscript(heldResult);
			}
			return;
		}
		const fileAfter = plugin.app.vault.getAbstractFileByPath(job.filePath);
		if (!(fileAfter instanceof TFile)) return;
		const svgAfter = await plugin.app.vault.read(fileAfter);
		const pageAfter = extractInkJsonFromSvg(svgAfter);
		const sessionOpen = !!getHandwritingTranscriptionSession(job.filePath);
		if (pageAfter && serializeBboxCellsAtLastTranscription(pageAfter) !== liveBboxCells) {
			if (sessionOpen) {
				// Editor is open, so keep this result and let session end assess a newer job.
				rememberHeldTranscript(heldResult);
				return;
			}
			if (job.reason === 'auto') {
				await enqueueAuto(job.filePath);
			}
			return;
		}
		if (sessionOpen) {
			// onTranscriptApplied would patch this embed's own line and remount it.
			rememberHeldTranscript(heldResult);
			return;
		}
		await saveWriteFileTranscript(plugin, fileAfter, transcript, {
			lastTranscriptionAt,
			bboxCellsAtLastTranscription: liveBboxCells,
		});
		await patchInkEmbedTranscriptAltsInVault(plugin, job.filePath, job.fileType, transcript);
	} catch (error) {
		if (!userCancelledInflightPaths.has(job.filePath)) {
			const jobError = asHandwritingTranscriptionJobError(error);
			if (!jobError.retryable) {
				const notice = handwritingTranscriptionNoticeForError(jobError);
				new Notice(notice);
				rememberTerminalRejection(job.filePath, rejectionBboxCells, jobError, notice);
			} else if (!isDeviceNetworkOnline()) {
				// Link dropped after the POST started. No delay and no notice.
				requeuePendingJob(job, { atFront: true });
			} else if (isTransientNetworkJobError(jobError)) {
				// onLine can still be true with no route. Stay silent until several throws.
				const nextCount = (job.networkFailureCount ?? 0) + 1;
				if (nextCount >= NETWORK_FAILURE_NOTICE_THRESHOLD) {
					showRetryableNoticeOnce(
						job.filePath,
						handwritingTranscriptionNoticeForError(jobError),
					);
				}
				requeueRetryableJob({ ...job, networkFailureCount: nextCount });
			} else {
				showRetryableNoticeOnce(job.filePath, handwritingTranscriptionNoticeForError(jobError));
				requeueRetryableJob(job);
			}
		}
	} finally {
		userCancelledInflightPaths.delete(job.filePath);
		inflightJob = null;
		isWorkerRunning = false;
		notifyHandwritingTranscriptionQueueChanged();
		if (!isStopped && !shouldDeferKickBecauseEditorOpen) {
			kickHandwritingTranscriptionQueue();
		}
	}
}

/**
 * Stores one finished transcript for a file whose editor is still open.
 */
function rememberHeldTranscript(held: HandwritingTranscriptionHeldResult): void {
	const blob = readHandwritingTranscriptionQueueBlob();
	const existingIndex = blob.heldTranscripts.findIndex((item) => item.filePath === held.filePath);
	if (existingIndex >= 0) {
		blob.heldTranscripts[existingIndex] = held;
	} else {
		blob.heldTranscripts.push(held);
	}
	writeHandwritingTranscriptionQueueBlob(blob);
}

/**
 * Drops a held transcript after it has been written, or when the SVG is gone.
 */
function removeHeldTranscript(filePath: string): void {
	const blob = readHandwritingTranscriptionQueueBlob();
	blob.heldTranscripts = blob.heldTranscripts.filter((item) => item.filePath !== filePath);
	writeHandwritingTranscriptionQueueBlob(blob);
}

/**
 * Writes the held transcript for one file, if the editor session has already closed.
 */
async function applyHeldTranscriptIfPresent(filePath: string): Promise<void> {
	const held = readHandwritingTranscriptionQueueBlob().heldTranscripts.find((item) => item.filePath === filePath);
	if (!held) return;
	try {
		const didApply = await publishHeldTranscript(held);
		if (!didApply) return;
		removeHeldTranscript(filePath);
	} catch {
		// Keep the held result for the next lock or launch.
	}
}

/**
 * Writes every held transcript whose editor is not open. Used on launch, before prune.
 */
async function applyReadyHeldTranscripts(): Promise<void> {
	const ready = readHandwritingTranscriptionQueueBlob().heldTranscripts.filter(
		(held) => !getHandwritingTranscriptionSession(held.filePath),
	);
	for (const held of ready) {
		try {
			const didApply = await publishHeldTranscript(held);
			if (didApply) removeHeldTranscript(held.filePath);
		} catch {
			// Keep the held result for the next lock or launch.
		}
	}
}

/**
 * Saves a held transcript onto the current SVG strokes, then patches note alts.
 * Returns false when the plugin is gone so the held result can be retried.
 */
async function publishHeldTranscript(held: HandwritingTranscriptionHeldResult): Promise<boolean> {
	const plugin = queuePlugin;
	if (!plugin) return false;
	const file = plugin.app.vault.getAbstractFileByPath(held.filePath);
	if (!(file instanceof TFile)) return true;
	await saveWriteFileTranscript(plugin, file, held.transcript, {
		lastTranscriptionAt: held.lastTranscriptionAt,
		bboxCellsAtLastTranscription: held.bboxCellsAtLastTranscription,
	});
	await patchInkEmbedTranscriptAltsInVault(plugin, held.filePath, held.fileType, held.transcript);
	return true;
}
