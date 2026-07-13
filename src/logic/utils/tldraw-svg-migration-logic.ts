import { normalizePath, TFile, Vault } from 'obsidian';
import { PLUGIN_VERSION, WRITING_LINE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';
import { logToVault } from 'src/logic/utils/log-to-vault';
import type { InkFileData } from 'src/components/formats/current/types/file-data';
import { isInkCanvasFile } from 'src/components/formats/current/utils/ink-file-storage-engine';
import {
	buildInkCanvasDrawingFileData,
	buildInkCanvasWritingFileData,
} from 'src/components/formats/current/utils/build-file-data';
import { buildFileStr } from 'src/components/formats/current/utils/buildFileStr';
import { buildDrawingEmbed } from 'src/components/formats/current/utils/build-embeds';
import { parseSettingsFromUrl } from 'src/components/formats/current/utils/parse-settings-from-url';
import { buildDrawingEmbedSettingsFromStrokes } from 'src/logic/utils/build-drawing-embed-settings-from-file';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import {
	migrateFromTldraw,
	migrateWritingFromTldraw,
	type TldrawSnapshotForMigration,
} from 'src/ink-canvas/migrate-from-tldraw';
import { renderStrokesToSvg, renderWritingStrokesToSvg } from 'src/ink-canvas/svg-export';
import type { EmbedSettings } from 'src/types/embed-settings';
import type { MigrationRunProgress } from 'src/logic/utils/migration-logic';

////////
////////

const V2_EMBED_PATH_REGEX = /!\[(InkWriting|InkDrawing)\]\(<([^>]+)>\)/g;

export type V2InkEmbedRef = {
	filepath: string;
	embedKind: 'writing' | 'drawing';
};

export type TldrawSvgFileScanEntry = {
	svgFile: TFile;
	fileKind: 'writing' | 'drawing';
	/** Same path as svgFile — in-place conversion (symmetry with v1 UI). */
	newSvgPath: string;
	referencingNotes: TFile[];
};

export type TldrawSvgVaultScanResult = {
	tldrawSvgFiles: TldrawSvgFileScanEntry[];
	affectedNotes: TFile[];
};

export type TldrawSvgMigrationResult = {
	convertedFiles: number;
	updatedNotes: number;
	updatedNotePaths: string[];
	skipped: string[];
	failed: string[];
};

export type ResolveVaultLinkPath = (
	linkpath: string,
	sourceNotePath: string,
) => string | null;

/**
 * Finds v2 image embed references in markdown (`![InkWriting|InkDrawing](<path>)`).
 */
export function findV2InkEmbedRefs(markdownContent: string): V2InkEmbedRef[] {
	const results: V2InkEmbedRef[] = [];
	let match: RegExpExecArray | null;
	V2_EMBED_PATH_REGEX.lastIndex = 0;
	while ((match = V2_EMBED_PATH_REGEX.exec(markdownContent)) !== null) {
		const alt = match[1];
		const filepath = match[2].trim();
		if (!filepath) continue;
		results.push({
			filepath,
			embedKind: alt === 'InkWriting' ? 'writing' : 'drawing',
		});
	}
	return results;
}

/**
 * Converts a v2 tldraw `InkFileData` payload to ink-canvas. Returns null if already ink-canvas
 * or not migratable.
 */
export function convertTldrawInkFileDataToInkCanvas(inkFileData: InkFileData): InkFileData | null {
	if (isInkCanvasFile(inkFileData)) return null;
	if (!inkFileData.tldraw || !inkFileData.meta) return null;

	const fileType = inkFileData.meta.fileType;
	if (fileType !== 'inkWriting' && fileType !== 'inkDrawing') return null;

	const tldrawSnapshot = inkFileData.tldraw as unknown as TldrawSnapshotForMigration;

	if (fileType === 'inkWriting') {
		const fallbackLineHeight = inkFileData.meta.writingLineHeight ?? WRITING_LINE_HEIGHT;
		const inkCanvasSnapshot = migrateWritingFromTldraw(tldrawSnapshot, fallbackLineHeight);
		const svgString = renderWritingStrokesToSvg(
			inkCanvasSnapshot.strokes,
			inkCanvasSnapshot,
			WRITING_PAGE_WIDTH,
		);
		const fileData = buildInkCanvasWritingFileData({
			inkCanvasSnapshot,
			svgString,
		});
		fileData.meta.pluginVersion = PLUGIN_VERSION;
		if (inkFileData.meta.transcript) {
			fileData.meta.transcript = inkFileData.meta.transcript;
		}
		if (inkCanvasSnapshot.writingLineHeight != null) {
			fileData.meta.writingLineHeight = inkCanvasSnapshot.writingLineHeight;
		}
		return fileData;
	}

	const inkCanvasSnapshot = migrateFromTldraw(tldrawSnapshot);
	const svgString = renderStrokesToSvg(inkCanvasSnapshot.strokes, inkCanvasSnapshot);
	const fileData = buildInkCanvasDrawingFileData({
		inkCanvasSnapshot,
		svgString,
	});
	fileData.meta.pluginVersion = PLUGIN_VERSION;
	if (inkFileData.meta.transcript) {
		fileData.meta.transcript = inkFileData.meta.transcript;
	}
	return fileData;
}

/**
 * Replaces drawing embed lines for a given SVG path with a rebuilt line using fitted viewBox
 * while preserving embed display size from the existing Edit Drawing URL.
 */
export function replaceV2DrawingEmbedLinesInMarkdown(
	markdown: string,
	svgPath: string,
	fittedSettings: EmbedSettings,
): string {
	const escapedPath = svgPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const lineRegex = new RegExp(
		` !\\[InkDrawing\\]\\(<${escapedPath}>\\) \\[Edit Drawing\\]\\(([^)]+)\\)`,
		'g',
	);

	return markdown.replace(lineRegex, (_match, urlPart: string) => {
		const { embedSettings: existing } = parseSettingsFromUrl(urlPart);
		const merged: EmbedSettings = {
			embedDisplay: { ...existing.embedDisplay },
			viewBox: { ...fittedSettings.viewBox },
		};
		const newLine = buildDrawingEmbed(svgPath, { embedSettings: merged }).trim();
		return ` ${newLine}`;
	});
}

async function isTldrawInkSvgFile(vault: Vault, file: TFile): Promise<boolean> {
	try {
		const svgString = await vault.read(file);
		const data = extractInkJsonFromSvg(svgString);
		if (!data) return false;
		return !isInkCanvasFile(data);
	} catch {
		return false;
	}
}

function resolveEmbedPath(
	vault: Vault,
	resolveLinkPath: ResolveVaultLinkPath,
	linkpath: string,
	sourceNotePath: string,
): string | null {
	const normalized = normalizePath(linkpath);
	const resolved = resolveLinkPath(normalized, sourceNotePath);
	if (resolved) return resolved;
	const byPath = vault.getAbstractFileByPath(normalized);
	if (byPath instanceof TFile) return byPath.path;
	return null;
}

/**
 * Scans the vault for v2 embeds whose linked SVG files still use tldraw metadata.
 */
export async function scanVaultForTldrawInkSvgFiles(
	vault: Vault,
	resolveLinkPath: ResolveVaultLinkPath,
	onProgress?: (scanned: number, total: number, foundCount: number) => void,
): Promise<TldrawSvgVaultScanResult> {
	const markdownFiles = vault.getMarkdownFiles();
	const total = markdownFiles.length;

	const fileMap = new Map<string, TldrawSvgFileScanEntry>();
	const affectedNoteSet = new Map<string, TFile>();
	const pendingChecks = new Map<string, Promise<boolean>>();

	for (let i = 0; i < markdownFiles.length; i++) {
		const note = markdownFiles[i];
		let content: string;

		try {
			content = await vault.read(note);
		} catch {
			onProgress?.(i + 1, total, fileMap.size);
			continue;
		}

		const refs = findV2InkEmbedRefs(content);
		if (refs.length > 0) {
			affectedNoteSet.set(note.path, note);
		}

		for (const ref of refs) {
			const canonicalPath = resolveEmbedPath(vault, resolveLinkPath, ref.filepath, note.path);
			if (!canonicalPath) continue;

			if (!fileMap.has(canonicalPath)) {
				const svgFile = vault.getAbstractFileByPath(canonicalPath);
				if (!(svgFile instanceof TFile)) continue;

				let checkPromise = pendingChecks.get(canonicalPath);
				if (!checkPromise) {
					checkPromise = isTldrawInkSvgFile(vault, svgFile);
					pendingChecks.set(canonicalPath, checkPromise);
				}

				const isTldraw = await checkPromise;
				if (!isTldraw) continue;

				fileMap.set(canonicalPath, {
					svgFile,
					fileKind: ref.embedKind,
					newSvgPath: canonicalPath,
					referencingNotes: [],
				});
			}

			const entry = fileMap.get(canonicalPath);
			if (entry && !entry.referencingNotes.some(n => n.path === note.path)) {
				entry.referencingNotes.push(note);
			}
		}

		onProgress?.(i + 1, total, fileMap.size);
	}

	return {
		tldrawSvgFiles: Array.from(fileMap.values()),
		affectedNotes: Array.from(affectedNoteSet.values()),
	};
}

/**
 * Builds a scan result for in-place migration of one tldraw-metadata SVG file.
 */
export async function buildSingleTldrawSvgScanResult(
	vault: Vault,
	svgFile: TFile,
	resolveLinkPath: ResolveVaultLinkPath,
): Promise<TldrawSvgVaultScanResult | null> {
	const isTldraw = await isTldrawInkSvgFile(vault, svgFile);
	if (!isTldraw) return null;

	const referencingNotes: TFile[] = [];
	let fileKind: 'writing' | 'drawing' | null = null;

	for (const note of vault.getMarkdownFiles()) {
		let content: string;
		try {
			content = await vault.read(note);
		} catch {
			continue;
		}

		for (const ref of findV2InkEmbedRefs(content)) {
			const canonicalPath = resolveEmbedPath(vault, resolveLinkPath, ref.filepath, note.path);
			if (canonicalPath !== svgFile.path) continue;
			referencingNotes.push(note);
			fileKind = ref.embedKind;
			break;
		}
	}

	if (!fileKind) {
		const svgString = await vault.read(svgFile);
		const inkFileData = extractInkJsonFromSvg(svgString);
		if (inkFileData?.meta.fileType === 'inkWriting') fileKind = 'writing';
		else if (inkFileData?.meta.fileType === 'inkDrawing') fileKind = 'drawing';
	}

	if (!fileKind) return null;

	return {
		tldrawSvgFiles: [{
			svgFile,
			fileKind,
			newSvgPath: svgFile.path,
			referencingNotes,
		}],
		affectedNotes: referencingNotes,
	};
}

/**
 * Converts tldraw SVG files in place and updates drawing embed viewBox params in notes.
 */
export async function executeTldrawSvgMigration(
	vault: Vault,
	scanResult: TldrawSvgVaultScanResult,
	onProgress?: (done: number, total: number, liveStats: MigrationRunProgress) => void,
): Promise<TldrawSvgMigrationResult> {
	const result: TldrawSvgMigrationResult = {
		convertedFiles: 0,
		updatedNotes: 0,
		updatedNotePaths: [],
		skipped: [],
		failed: [],
	};

	const drawingEmbedSettingsBySvgPath = new Map<string, EmbedSettings>();
	const convertedPaths = new Set<string>();

	const total = scanResult.tldrawSvgFiles.length + scanResult.affectedNotes.length;
	let done = 0;

	const reportProgress = () => {
		onProgress?.(done, total, {
			convertedFiles: result.convertedFiles,
			skippedCount: result.skipped.length,
			failedCount: result.failed.length,
		});
	};

	logToVault(
		'Tldraw SVG migration started. Files: '
			+ scanResult.tldrawSvgFiles.length
			+ ', Notes: '
			+ scanResult.affectedNotes.length,
	);

	for (const entry of scanResult.tldrawSvgFiles) {
		try {
			const svgString = await vault.read(entry.svgFile);
			const inkFileData = extractInkJsonFromSvg(svgString);
			if (!inkFileData) {
				result.skipped.push(entry.svgFile.path + ' (no ink JSON)');
				done++;
				reportProgress();
				continue;
			}

			const converted = convertTldrawInkFileDataToInkCanvas(inkFileData);
			if (!converted) {
				result.skipped.push(entry.svgFile.path + ' (already ink-canvas or not tldraw)');
				done++;
				reportProgress();
				continue;
			}

			if (entry.fileKind === 'drawing' && converted.inkCanvas) {
				const embedSettings = buildDrawingEmbedSettingsFromStrokes(
					converted.inkCanvas.strokes,
				);
				if (embedSettings) {
					drawingEmbedSettingsBySvgPath.set(entry.newSvgPath, embedSettings);
				}
			}

			const out = buildFileStr(converted);
			await vault.modify(entry.svgFile, out);
			convertedPaths.add(entry.newSvgPath);
			result.convertedFiles++;
		} catch (err: unknown) {
			const errMessage = err instanceof Error ? err.message : String(err);
			logToVault('Tldraw SVG migration file error: ' + entry.svgFile.path + ' – ' + errMessage);
			result.failed.push(entry.svgFile.path + ': ' + errMessage);
		}

		done++;
		reportProgress();
	}

	for (const note of scanResult.affectedNotes) {
		try {
			let content = await vault.read(note);
			let modified = false;

			for (const [svgPath, embedSettings] of drawingEmbedSettingsBySvgPath) {
				if (!convertedPaths.has(svgPath)) continue;
				const updated = replaceV2DrawingEmbedLinesInMarkdown(content, svgPath, embedSettings);
				if (updated !== content) {
					content = updated;
					modified = true;
				}
			}

			if (modified) {
				await vault.modify(note, content);
				result.updatedNotes++;
				result.updatedNotePaths.push(note.path);
			}
		} catch (err: unknown) {
			const errMessage = err instanceof Error ? err.message : String(err);
			result.failed.push(note.path + ': ' + errMessage);
		}

		done++;
		reportProgress();
	}

	logToVault(
		'Tldraw SVG migration complete. Converted: '
			+ result.convertedFiles
			+ ', Notes updated: '
			+ result.updatedNotes,
	);

	return result;
}
