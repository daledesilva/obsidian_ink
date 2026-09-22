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
	const pageData = extractInkJsonFromSvg(options.svgFileContent);
	if (!pageData) {
		new Notice('Could not read ink file for transcription');
		return;
	}
	if (!inkFileHasStrokes(pageData)) {
		new Notice('Nothing to transcribe');
		return;
	}
	const pendingJob: HandwritingTranscriptionPendingJob = {
		filePath: options.file.path,
		fileType: options.fileType,
		reason: 'manual',
		bboxCellsAtLastTranscription: serializeBboxCellsAtLastTranscription(pageData),
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
	if (nextJobIndex < 0) {
		return;
	}
	const nextJob = blob.pending[nextJobIndex];
	blob.pending.splice(nextJobIndex, 1);
	writeHandwritingTranscriptionQueueBlob(blob);
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
		const liveBboxCells = serializeBboxCellsAtLastTranscription(pageData);
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
		const transcript = await transcribeWriting(svgFileContent);
		const lastTranscriptionAt = new Date().toISOString();
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
		const typeLabel = job.fileType === 'inkWriting' ? 'Writing' : 'Drawing';
		new Notice(`${typeLabel} transcription finished: ${fileAfter.basename}`);
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
	const typeLabel = held.fileType === 'inkWriting' ? 'Writing' : 'Drawing';
	new Notice(`${typeLabel} transcription finished: ${file.basename}`);
	return true;
}
