import { Notice, TFile } from 'obsidian';
import InkPlugin from 'src/main';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { transcribeWriting } from 'src/logic/transcribe-writing';
import { saveWriteFileTranscript } from 'src/components/formats/current/utils/needsTranscriptUpdate';
import { computeSvgContentHash, inkFileHasStrokes, svgContentHashHammingRatio } from 'src/logic/svg-content-hash';
import { patchInkEmbedTranscriptAltsInVault } from 'src/logic/handwriting-transcription-apply';
import { subscribeAlmostUsefulSessionChanged, readAlmostUsefulSession } from 'src/logic/almostuseful/almostuseful-session';
import {
	listHandwritingTranscriptionSessions,
	getHandwritingTranscriptionSession,
	registerHandwritingTranscriptionSession,
	unregisterHandwritingTranscriptionSession,
	type HandwritingTranscriptionSession,
} from 'src/logic/handwriting-transcription-session-registry';
import {
	readHandwritingTranscriptionQueueBlob,
	writeHandwritingTranscriptionQueueBlob,
	type HandwritingTranscriptionFileType,
	type HandwritingTranscriptionPendingJob,
	type HandwritingTranscriptionOpenSession,
} from 'src/logic/handwriting-transcription-queue-store';

//////////
//////////

const LAUNCH_RESUME_GRACE_MS = 5000;

// Plugin-owned serial worker: survives embed unmount and Obsidian quit. React/widgets
// only register sessions and call enqueueAuto / enqueueManualTranscription.

let queuePlugin: InkPlugin | null = null;
let inflightJob: HandwritingTranscriptionPendingJob | null = null;
let isWorkerRunning = false;
let isStopped = false;
let launchGraceTimerId: number | null = null;
let unsubscribeSessionChanged: (() => void) | null = null;

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
		kickHandwritingTranscriptionQueue();
	});
	plugin.registerDomEvent(window, 'beforeunload', () => {
		promoteOpenSessionsToPendingOnQuit();
	});
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
	blob.pending = blob.pending.filter((job) => job.filePath !== filePath);
	writeHandwritingTranscriptionQueueBlob(blob);
}

/**
 * Drops waiting auto jobs when the user turns off auto-transcribe for a type.
 */
export function dropWaitingAutoTranscriptionJobsForFileType(
	fileType: HandwritingTranscriptionFileType,
): void {
	const blob = readHandwritingTranscriptionQueueBlob();
	blob.pending = blob.pending.filter((job) => {
		if (job.reason !== 'auto') return true;
		return job.fileType !== fileType;
	});
	writeHandwritingTranscriptionQueueBlob(blob);
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
 */
export function unregisterTranscriptionEditorSession(filePath: string): void {
	unregisterHandwritingTranscriptionSession(filePath);
	syncPersistedOpenTranscriptionSessions();
	kickHandwritingTranscriptionQueue();
}

/**
 * Auto-enqueue after lock/close/quit. Honours per-type toggle, empty canvas, and Hamming-0 skip.
 */
export async function enqueueAuto(filePath: string): Promise<void> {
	const plugin = queuePlugin;
	if (!plugin) return;
	const file = plugin.app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) return;
	const svgFileContent = await plugin.app.vault.read(file);
	const pageData = extractInkJsonFromSvg(svgFileContent);
	if (!pageData) return;
	const fileType = pageData.meta.fileType;
	if (fileType !== 'inkWriting' && fileType !== 'inkDrawing') return;
	if (!isAutoTranscribeEnabled(plugin, fileType)) return;
	if (!inkFileHasStrokes(pageData)) return;
	const svgContentHash = computeSvgContentHash(pageData);
	const storedHash = pageData.meta.svgContentHash;
	if (storedHash && svgContentHashHammingRatio(storedHash, svgContentHash) === 0) return;
	const pendingJob: HandwritingTranscriptionPendingJob = {
		filePath,
		fileType,
		reason: 'auto',
		svgContentHash,
		enqueuedAt: new Date().toISOString(),
	};
	if (shouldSkipEnqueueBecauseInflightUnchanged(pendingJob)) return;
	upsertPendingJob(pendingJob);
	kickHandwritingTranscriptionQueue();
}

/**
 * Manual overflow Transcribe — never gated by auto-close toggles; jumps the waiting list.
 */
export async function enqueueManualTranscription(
	options: EnqueueManualTranscriptionOptions,
): Promise<void> {
	const pageData = extractInkJsonFromSvg(options.svgFileContent);
	if (!pageData) {
		new Notice('Could not read ink file for transcription');
		return;
	}
	if (!inkFileHasStrokes(pageData)) {
		new Notice('Nothing to transcribe');
		return;
	}
	const svgContentHash = computeSvgContentHash(pageData);
	const pendingJob: HandwritingTranscriptionPendingJob = {
		filePath: options.file.path,
		fileType: options.fileType,
		reason: 'manual',
		svgContentHash,
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
			svgContentHash: '',
			enqueuedAt: new Date().toISOString(),
		});
	}
	blob.openSessions = [];
	writeHandwritingTranscriptionQueueBlob(blob);
}

function resumeHandwritingTranscriptionQueueOnLaunch(): void {
	const plugin = queuePlugin;
	if (!plugin) return;
	const blob = readHandwritingTranscriptionQueueBlob();
	for (const session of blob.openSessions) {
		if (!isAutoTranscribeEnabled(plugin, session.fileType)) continue;
		const alreadyPending = blob.pending.some((job) => job.filePath === session.filePath);
		if (alreadyPending) continue;
		blob.pending.push({
			filePath: session.filePath,
			fileType: session.fileType,
			reason: 'auto',
			svgContentHash: '',
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
			const liveHash = computeSvgContentHash(pageData);
			const storedHash = pageData.meta.svgContentHash;
			if (
				job.reason === 'auto'
				&& storedHash
				&& svgContentHashHammingRatio(storedHash, liveHash) === 0
			) {
				continue;
			}
			kept.push({
				...job,
				svgContentHash: liveHash,
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
 * Starts the next waiting job if the worker is idle and signed in.
 */
export function kickHandwritingTranscriptionQueue(): void {
	if (isStopped || isWorkerRunning) return;
	if (launchGraceTimerId !== null) return;
	if (!readAlmostUsefulSession()?.accessToken) return;
	const blob = readHandwritingTranscriptionQueueBlob();
	const nextJobIndex = blob.pending.findIndex((job) => {
		if (job.reason !== 'auto') return true;
		return !getHandwritingTranscriptionSession(job.filePath);
	});
	if (nextJobIndex < 0) return;
	const nextJob = blob.pending[nextJobIndex];
	blob.pending.splice(nextJobIndex, 1);
	writeHandwritingTranscriptionQueueBlob(blob);
	void runTranscriptionJob(nextJob);
}

/**
 * Same file already POSTing: skip a follow-up unless stroke SimHash changed.
 */
function shouldSkipEnqueueBecauseInflightUnchanged(
	job: HandwritingTranscriptionPendingJob,
): boolean {
	if (!inflightJob || inflightJob.filePath !== job.filePath) return false;
	if (!inflightJob.svgContentHash || !job.svgContentHash) return false;
	return svgContentHashHammingRatio(inflightJob.svgContentHash, job.svgContentHash) === 0;
}

function isAutoTranscribeEnabled(
	plugin: InkPlugin,
	fileType: HandwritingTranscriptionFileType,
): boolean {
	if (fileType === 'inkWriting') return plugin.settings.writingAutoTranscribeOnClose;
	return plugin.settings.drawingAutoTranscribeOnClose;
}

async function runTranscriptionJob(job: HandwritingTranscriptionPendingJob): Promise<void> {
	isWorkerRunning = true;
	inflightJob = job;
	let shouldDeferKickBecauseEditorOpen = false;
	try {
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
		const liveHash = computeSvgContentHash(pageData);
		if (job.svgContentHash && svgContentHashHammingRatio(job.svgContentHash, liveHash) > 0) {
			if (job.reason === 'auto') {
				await enqueueAuto(job.filePath);
			}
			return;
		}
		const storedHash = pageData.meta.svgContentHash;
		if (
			job.reason === 'auto'
			&& storedHash
			&& svgContentHashHammingRatio(storedHash, liveHash) === 0
		) {
			return;
		}
		const transcript = await transcribeWriting(svgFileContent);
		if (isStopped) return;
		const fileAfter = plugin.app.vault.getAbstractFileByPath(job.filePath);
		if (!(fileAfter instanceof TFile)) return;
		const svgAfter = await plugin.app.vault.read(fileAfter);
		const pageAfter = extractInkJsonFromSvg(svgAfter);
		if (pageAfter && svgContentHashHammingRatio(liveHash, computeSvgContentHash(pageAfter)) > 0) {
			return;
		}
		const svgContentHashedAt = new Date().toISOString();
		await saveWriteFileTranscript(plugin, fileAfter, transcript, {
			svgContentHash: liveHash,
			svgContentHashedAt,
		});
		getHandwritingTranscriptionSession(job.filePath)?.onTranscriptApplied?.(
			transcript,
			liveHash,
			svgContentHashedAt,
		);
		await patchInkEmbedTranscriptAltsInVault(plugin, job.filePath, job.fileType, transcript);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Handwriting transcription failed';
		new Notice(message);
		const blob = readHandwritingTranscriptionQueueBlob();
		const alreadyQueued = blob.pending.some((pending) => pending.filePath === job.filePath);
		if (!alreadyQueued) {
			blob.pending.push(job);
			writeHandwritingTranscriptionQueueBlob(blob);
		}
	} finally {
		inflightJob = null;
		isWorkerRunning = false;
		if (!isStopped && !shouldDeferKickBecauseEditorOpen) {
			kickHandwritingTranscriptionQueue();
		}
	}
}
