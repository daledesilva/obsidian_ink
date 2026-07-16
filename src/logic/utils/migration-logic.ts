import { TFile, Vault } from "obsidian";
import { PLUGIN_VERSION, WRITING_LINE_HEIGHT, WRITING_PAGE_WIDTH, WRITE_EMBED_KEY, DRAW_EMBED_KEY } from "src/constants";
import { logToVault } from "src/logic/utils/log-to-vault";
import { InkFileData } from "src/components/formats/current/types/file-data";
import { InkFileData_v1 } from "src/components/formats/v1-code-blocks/types/file-data";
import {
	buildInkCanvasDrawingFileData,
	buildInkCanvasWritingFileData,
} from "src/components/formats/current/utils/build-file-data";
import { buildFileStr } from "src/components/formats/current/utils/buildFileStr";
import { buildWritingEmbed, buildDrawingEmbed } from "src/components/formats/current/utils/build-embeds";
import { buildDrawingEmbedSettingsFromStrokes } from "src/logic/utils/build-drawing-embed-settings-from-file";
import type { EmbedSettings } from "src/types/embed-settings";
import { parseSvgViewBoxAspectRatio } from "src/logic/utils/writing-embed-aspect-ratio";
import {
	migrateFromTldraw,
	migrateWritingFromTldraw,
	type TldrawSnapshotForMigration,
} from "src/ink-canvas/migrate-from-tldraw";
import { renderStrokesToSvg, renderWritingStrokesToSvg } from "src/ink-canvas/svg-export";

////////
////////

export type LegacyEmbedBlock = {
	fullMatch: string;
	embedType: 'writing' | 'drawing';
	filepath: string;
};

export type LegacyFileScanResult = {
	legacyFile: TFile;
	fileType: 'writing' | 'drawing';
	newSvgPath: string;
	referencingNotes: TFile[];
};

export type VaultScanResult = {
	legacyFiles: LegacyFileScanResult[];
	affectedNotes: TFile[];
};

////////

/**
 * Finds all legacy ink code block embeds in a markdown string.
 * Returns an array of matches with embed type, filepath, and the original text.
 */
export function findLegacyEmbedBlocks(markdownContent: string): LegacyEmbedBlock[] {
	const results: LegacyEmbedBlock[] = [];
	const codeBlockRegex = new RegExp(
		'```(?:' + WRITE_EMBED_KEY + '|' + DRAW_EMBED_KEY + ')\\n([\\s\\S]*?)\\n```',
		'g'
	);

	let match: RegExpExecArray | null;
	while ((match = codeBlockRegex.exec(markdownContent)) !== null) {
		const fullMatch = match[0];
		const jsonContent = match[1].trim();
		const embedType: 'writing' | 'drawing' = fullMatch.startsWith('```' + WRITE_EMBED_KEY)
			? 'writing'
			: 'drawing';

		try {
			const parsed: unknown = JSON.parse(jsonContent);
			if (typeof parsed === 'object' && parsed !== null) {
				const embedRecord = parsed as Record<string, unknown>;
				const filepathValue = embedRecord['filepath'];
				if (typeof filepathValue === 'string' && filepathValue.length > 0) {
					results.push({ fullMatch, embedType, filepath: filepathValue });
				}
			}
		} catch (_) {
			// Malformed JSON – skip
		}
	}

	return results;
}

/**
 * Replaces one or more occurrences of a legacy code block in markdown
 * with the new format embed string (trimmed so no extra newlines).
 */
export function replaceLegacyBlockInMarkdown(
	markdown: string,
	block: LegacyEmbedBlock,
	newEmbed: string,
): string {
	const trimmedEmbed = newEmbed.replace(/^\n+|\n+$/g, '');
	return markdown.split(block.fullMatch).join(trimmedEmbed);
}

/**
 * Converts a legacy v1 JSON file string into ink-canvas InkFileData (SVG metadata + rendered paths).
 * Returns null if the JSON cannot be parsed.
 */
export function convertLegacyToInkCanvasFileData(
	legacyJson: string,
	fileType: 'writing' | 'drawing',
): InkFileData | null {
	let legacyData: InkFileData_v1;
	try {
		legacyData = JSON.parse(legacyJson) as InkFileData_v1;
	} catch (_) {
		return null;
	}

	if (!legacyData.tldraw || !legacyData.meta) return null;

	const tldrawSnapshot = legacyData.tldraw as unknown as TldrawSnapshotForMigration;

	if (fileType === 'writing') {
		const inkCanvasSnapshot = migrateWritingFromTldraw(tldrawSnapshot, WRITING_LINE_HEIGHT);
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
		if (legacyData.meta.transcript) {
			fileData.meta.transcript = legacyData.meta.transcript;
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
	if (legacyData.meta.transcript) {
		fileData.meta.transcript = legacyData.meta.transcript;
	}
	return fileData;
}

/** @deprecated Use {@link convertLegacyToInkCanvasFileData}. Kept for existing imports. */
export function convertLegacyJsonToInkFileData(
	legacyJson: string,
	fileType: 'writing' | 'drawing',
): InkFileData | null {
	return convertLegacyToInkCanvasFileData(legacyJson, fileType);
}

/**
 * Returns the new SVG path for a given legacy file path.
 * e.g. "Ink/Writing/my-note.writing" -> "Ink/Writing/my-note.svg"
 */
export function getLegacySvgPath(legacyFilePath: string): string {
	const dotIndex = legacyFilePath.lastIndexOf('.');
	if (dotIndex < 0) return legacyFilePath + '.svg';
	return legacyFilePath.substring(0, dotIndex) + '.svg';
}

export function isLegacyInkFilePath(filePath: string): boolean {
	return filePath.endsWith('.writing') || filePath.endsWith('.drawing');
}

export function getLegacyInkFileType(filePath: string): 'writing' | 'drawing' | null {
	if (filePath.endsWith('.writing')) return 'writing';
	if (filePath.endsWith('.drawing')) return 'drawing';
	return null;
}

/** True when the vault contains any `.writing` or `.drawing` attachment. */
export function vaultHasLegacyInkFiles(vault: Vault): boolean {
	return vault.getFiles().some(
		file => file.extension === 'writing' || file.extension === 'drawing',
	);
}

function addLegacyFileToMap(
	legacyFileMap: Map<string, LegacyFileScanResult>,
	legacyFile: TFile,
	fileType: 'writing' | 'drawing',
): void {
	if (legacyFileMap.has(legacyFile.path)) return;
	legacyFileMap.set(legacyFile.path, {
		legacyFile,
		fileType,
		newSvgPath: getLegacySvgPath(legacyFile.path),
		referencingNotes: [],
	});
}

/** Vault-root folder for dry-run legacy conversions (notes are not updated). */
export const INK_TEST_CONVERSIONS_FOLDER = '_ink-test-conversions';

/**
 * Basename for a test-run SVG (e.g. `Ink/Writing/note.writing` → `note.svg`).
 */
export function getTestRunSvgBasename(legacyFilePath: string): string {
	const slashIndex = legacyFilePath.lastIndexOf('/');
	const fileName = slashIndex < 0 ? legacyFilePath : legacyFilePath.substring(slashIndex + 1);
	const dotIndex = fileName.lastIndexOf('.');
	const nameWithoutExt = dotIndex < 0 ? fileName : fileName.substring(0, dotIndex);
	return `${nameWithoutExt}.svg`;
}

/**
 * Maps each legacy path to a unique test-run output path under {@link INK_TEST_CONVERSIONS_FOLDER}.
 * Uses the legacy filename as-is; on conflict appends `_1`, `_2`, etc. before `.svg`.
 */
export function buildTestRunSvgPathMap(legacyFilePaths: string[]): Map<string, string> {
	const usedCountByStem = new Map<string, number>();
	const pathMap = new Map<string, string>();

	for (const legacyPath of legacyFilePaths) {
		const basename = getTestRunSvgBasename(legacyPath);
		const stem = basename.slice(0, -'.svg'.length);
		const useCount = usedCountByStem.get(stem) ?? 0;
		usedCountByStem.set(stem, useCount + 1);

		const fileName = useCount === 0 ? basename : `${stem}_${useCount}.svg`;
		pathMap.set(legacyPath, `${INK_TEST_CONVERSIONS_FOLDER}/${fileName}`);
	}

	return pathMap;
}

/** Single-file helper; prefer {@link buildTestRunSvgPathMap} when converting a batch. */
export function getTestRunSvgPath(legacyFilePath: string): string {
	return buildTestRunSvgPathMap([legacyFilePath]).get(legacyFilePath)!;
}

export type MigrationOptions = {
	/** Write converted SVGs to {@link INK_TEST_CONVERSIONS_FOLDER}; do not update notes or delete legacy files. */
	testRun?: boolean;
	/** When set, note updates only replace legacy blocks for this legacy attachment path. */
	singleLegacyFilePath?: string;
};

export function resolveMigrationOutputSvgPath(
	legacyFilePath: string,
	options?: MigrationOptions,
	testRunSvgPathByLegacyPath?: Map<string, string>,
): string {
	if (options?.testRun) {
		return testRunSvgPathByLegacyPath?.get(legacyFilePath) ?? getTestRunSvgPath(legacyFilePath);
	}
	return getLegacySvgPath(legacyFilePath);
}

async function ensureVaultFolderExists(vault: Vault, folderPath: string): Promise<void> {
	if (!vault.getAbstractFileByPath(folderPath)) {
		await vault.createFolder(folderPath);
	}
}

/**
 * Builds a vault scan result for migrating one legacy `.writing` / `.drawing` file.
 */
export async function buildSingleLegacyFileScanResult(
	vault: Vault,
	legacyFile: TFile,
): Promise<VaultScanResult | null> {
	const fileType = getLegacyInkFileType(legacyFile.path);
	if (!fileType) return null;

	const referencingNotes: TFile[] = [];

	for (const note of vault.getMarkdownFiles()) {
		let content: string;
		try {
			content = await vault.read(note);
		} catch {
			continue;
		}

		const blocks = findLegacyEmbedBlocks(content);
		if (blocks.some(block => block.filepath === legacyFile.path)) {
			referencingNotes.push(note);
		}
	}

	return {
		legacyFiles: [{
			legacyFile,
			fileType,
			newSvgPath: getLegacySvgPath(legacyFile.path),
			referencingNotes,
		}],
		affectedNotes: referencingNotes,
	};
}

/** Live counters for migration execute progress UI (must be passed mid-run; result is only assigned after await). */
export type MigrationRunProgress = {
	convertedFiles: number;
	skippedCount: number;
	failedCount: number;
};

/**
 * Scans the vault for legacy `.writing` / `.drawing` files and notes with legacy embeds.
 * Returns a VaultScanResult with every legacy file to convert and notes to update.
 * Calls onProgress(scanned, total, foundCount) after each markdown file so the modal can
 * show live found/remaining counts — callers must not read the eventual return value mid-scan.
 */
export async function scanVaultForLegacyEmbeds(
	vault: Vault,
	onProgress?: (scanned: number, total: number, foundCount: number) => void,
): Promise<VaultScanResult> {
	const markdownFiles = vault.getMarkdownFiles();
	const total = markdownFiles.length;

	const legacyFileMap = new Map<string, LegacyFileScanResult>();
	const affectedNoteSet = new Map<string, TFile>();

	// Pass 1: every legacy attachment in the vault (including orphans not embedded in notes)
	for (const vaultFile of vault.getFiles()) {
		const fileType = getLegacyInkFileType(vaultFile.path);
		if (fileType) {
			addLegacyFileToMap(legacyFileMap, vaultFile, fileType);
		}
	}

	// Pass 2: notes with legacy code-block embeds — attach referencing notes
	for (let i = 0; i < markdownFiles.length; i++) {
		const note = markdownFiles[i];
		let content: string;

		try {
			content = await vault.read(note);
		} catch (_) {
			onProgress?.(i + 1, total, legacyFileMap.size);
			continue;
		}

		const blocks = findLegacyEmbedBlocks(content);
		if (blocks.length === 0) {
			onProgress?.(i + 1, total, legacyFileMap.size);
			continue;
		}

		affectedNoteSet.set(note.path, note);

		for (const block of blocks) {
			const legacyFile = vault.getAbstractFileByPath(block.filepath);
			if (legacyFile instanceof TFile) {
				addLegacyFileToMap(legacyFileMap, legacyFile, block.embedType);
			}

			const entry = legacyFileMap.get(block.filepath);
			if (entry && !entry.referencingNotes.find(n => n.path === note.path)) {
				entry.referencingNotes.push(note);
			}
		}

		onProgress?.(i + 1, total, legacyFileMap.size);
	}

	return {
		legacyFiles: Array.from(legacyFileMap.values()),
		affectedNotes: Array.from(affectedNoteSet.values()),
	};
}

export type MigrationResult = {
	convertedFiles: number;
	updatedNotes: number;
	updatedNotePaths: string[];
	skipped: string[];
	failed: string[];
	/** Set when {@link MigrationOptions.testRun} was used. */
	testRunOutputFolder?: string;
};

/**
 * Executes the migration: converts each legacy file to SVG and updates referencing notes.
 * Calls onProgress(done, total, liveStats) after each step so the UI can update mid-run.
 */
export async function executeMigration(
	vault: Vault,
	scanResult: VaultScanResult,
	onProgress?: (done: number, total: number, liveStats: MigrationRunProgress) => void,
	options?: MigrationOptions,
): Promise<MigrationResult> {
	const isTestRun = options?.testRun === true;
	const shouldDeleteLegacyFiles = !isTestRun;

	const result: MigrationResult = {
		convertedFiles: 0,
		updatedNotes: 0,
		updatedNotePaths: [],
		skipped: [],
		failed: [],
		...(isTestRun ? { testRunOutputFolder: INK_TEST_CONVERSIONS_FOLDER } : {}),
	};

	const notesToUpdate = isTestRun ? [] : scanResult.affectedNotes;
	const legacyFilesToConvert = options?.singleLegacyFilePath
		? scanResult.legacyFiles.filter(entry => entry.legacyFile.path === options.singleLegacyFilePath)
		: scanResult.legacyFiles;
	const total = legacyFilesToConvert.length + notesToUpdate.length;
	let done = 0;

	logToVault(
		'Migration started. Files: ' + legacyFilesToConvert.length
		+ ', Notes: ' + notesToUpdate.length
		+ (isTestRun ? ' (test run)' : ''),
	);

	if (isTestRun) {
		await ensureVaultFolderExists(vault, INK_TEST_CONVERSIONS_FOLDER);
	}

	const testRunSvgPathByLegacyPath = isTestRun
		? buildTestRunSvgPathMap(legacyFilesToConvert.map(entry => entry.legacyFile.path))
		: undefined;

	const drawingEmbedSettingsBySvgPath = new Map<string, EmbedSettings>();
	const writingAspectRatioBySvgPath = new Map<string, number>();

	const reportProgress = () => {
		onProgress?.(done, total, {
			convertedFiles: result.convertedFiles,
			skippedCount: result.skipped.length,
			failedCount: result.failed.length,
		});
	};

	// Step 1: Convert each legacy file to SVG
	for (const entry of legacyFilesToConvert) {
		try {
			const legacyJson = await vault.read(entry.legacyFile);
			const inkFileData = convertLegacyToInkCanvasFileData(legacyJson, entry.fileType);

			if (!inkFileData) {
				result.skipped.push(entry.legacyFile.path + ' (could not parse)');
				done++;
				reportProgress();
				continue;
			}

			const outputSvgPath = resolveMigrationOutputSvgPath(
				entry.legacyFile.path,
				options,
				testRunSvgPathByLegacyPath,
			);

			// Permanent runs overwrite a same-path SVG when present so re-migration replaces
			// stale output; legacy is deleted only after that write succeeds.
			const existing = vault.getAbstractFileByPath(outputSvgPath);

			if (!isTestRun && entry.fileType === 'drawing' && inkFileData.inkCanvas) {
				const embedSettings = buildDrawingEmbedSettingsFromStrokes(
					inkFileData.inkCanvas.strokes,
				);
				if (embedSettings) {
					drawingEmbedSettingsBySvgPath.set(outputSvgPath, embedSettings);
				}
			}

			const svgStr = buildFileStr(inkFileData);
			if (!isTestRun && entry.fileType === 'writing') {
				const writingAspectRatio = parseSvgViewBoxAspectRatio(svgStr);
				if (writingAspectRatio != null) {
					writingAspectRatioBySvgPath.set(outputSvgPath, writingAspectRatio);
				}
			}
			if (existing instanceof TFile) {
				try {
					await vault.modify(existing, svgStr);
				} catch (err: unknown) {
					const detail = err instanceof Error ? err.message : String(err);
					throw new Error('failed to overwrite existing SVG – ' + detail);
				}
			} else {
				try {
					await vault.create(outputSvgPath, svgStr);
				} catch (err: unknown) {
					const detail = err instanceof Error ? err.message : String(err);
					throw new Error('failed to create SVG – ' + detail);
				}
			}

			if (shouldDeleteLegacyFiles) {
				try {
					await vault.delete(entry.legacyFile);
				} catch (err: unknown) {
					const detail = err instanceof Error ? err.message : String(err);
					throw new Error('failed to delete legacy file – ' + detail);
				}
			}
			result.convertedFiles++;
		} catch (err: unknown) {
			const errMessage = err instanceof Error ? err.message : String(err);
			logToVault('Migration file error: ' + entry.legacyFile.path + ' – ' + errMessage);
			result.failed.push(entry.legacyFile.path + ': ' + errMessage);
		}

		done++;
		reportProgress();
	}

	// Step 2: Update markdown notes
	for (const note of notesToUpdate) {
		try {
			let content = await vault.read(note);
			const blocks = findLegacyEmbedBlocks(content);

			for (const block of blocks) {
				if (options?.singleLegacyFilePath && block.filepath !== options.singleLegacyFilePath) {
					continue;
				}
				const newSvgPath = resolveMigrationOutputSvgPath(block.filepath, options);
				const newEmbed =
					block.embedType === 'writing'
						? (() => {
							const aspectRatio = writingAspectRatioBySvgPath.get(newSvgPath);
							return aspectRatio != null
								? buildWritingEmbed(newSvgPath, { aspectRatio })
								: buildWritingEmbed(newSvgPath);
						})()
						: (() => {
							const embedSettings = drawingEmbedSettingsBySvgPath.get(newSvgPath);
							return embedSettings
								? buildDrawingEmbed(newSvgPath, { embedSettings })
								: buildDrawingEmbed(newSvgPath);
						})();
				content = replaceLegacyBlockInMarkdown(content, block, newEmbed);
			}

		await vault.modify(note, content);
		result.updatedNotes++;
		result.updatedNotePaths.push(note.path);
		} catch (err: unknown) {
			const errMessage = err instanceof Error ? err.message : String(err);
			result.failed.push(note.path + ': ' + errMessage);
		}

		done++;
		reportProgress();
	}

	logToVault('Migration complete. Converted: ' + result.convertedFiles + ', Failed: ' + result.failed.length + ', Skipped: ' + result.skipped.length);

	return result;
}
