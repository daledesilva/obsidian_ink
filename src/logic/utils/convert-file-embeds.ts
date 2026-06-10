import { TFile, Vault } from "obsidian";
import InkPlugin from "src/main";
import { buildWritingEmbed, buildDrawingEmbed } from "src/components/formats/current/utils/build-embeds";
import { convertWriteFileToDraw } from "src/components/formats/current/utils/convertWriteFileToDraw";
import { convertDrawFileToWrite } from "src/components/formats/current/utils/convertDrawFileToWrite";
import { duplicateDrawingFile, duplicateWritingFile } from "src/components/formats/current/utils/duplicate-files";
import { isInkCanvasFile } from "src/components/formats/current/utils/ink-file-storage-engine";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import { buildDrawingEmbedSettingsFromStrokes } from "src/logic/utils/build-drawing-embed-settings-from-file";
import type { EmbedSettings } from "src/types/embed-settings";
// View type strings (avoid importing from view modules to prevent heavy deps in tests)
const INK_WRITING_VIEW_TYPE = "ink_writing-view";
const INK_DRAWING_VIEW_TYPE = "ink_drawing-view";

////////
////////

/**
 * Closes any workspace leaves that have the given file open in an ink view.
 * Prevents open views from overwriting the converted file when they save.
 */
function closeLeavesWithFileOpen(plugin: InkPlugin, filePath: string): void {
	const workspace = plugin.app.workspace;
	const viewTypes = [INK_WRITING_VIEW_TYPE, INK_DRAWING_VIEW_TYPE];

	for (const viewType of viewTypes) {
		const leaves = workspace.getLeavesOfType(viewType);
		for (const leaf of leaves) {
			const view = leaf.view as { file?: { path: string } };
			if (view?.file?.path === filePath) {
				leaf.detach();
			}
		}
	}
}

export type FileConversionScope =
	| { mode: 'in-place' }
	| {
		mode: 'duplicate';
		instigatingNote?: TFile;
		/** Which notes get embed lines rewritten to point at the converted copy. */
		embedUpdate: 'all-affected' | 'instigating-only' | 'none';
	};

export const FILE_CONVERSION_IN_PLACE: FileConversionScope = { mode: 'in-place' };

export type FileConversionResult = {
	updatedNotePaths: string[];
	failed: string[];
	/** The file at its final path after conversion (and optional move). */
	finalFile: TFile | null;
	/** Original file path before conversion (unchanged when duplicating). */
	originalFilePath: string;
	/** True when a copy was converted and the original file was left unchanged. */
	wasDuplicated: boolean;
};

////////

/**
 * Scans the vault for markdown files that contain a v2 embed referencing the
 * given SVG file path with the given embed type.
 *
 * Calls onProgress(scanned, total) after each file is checked.
 */
export async function findNotesContainingFileEmbed(
	vault: Vault,
	svgFilePath: string,
	fromType: 'inkWriting' | 'inkDrawing',
	onProgress?: (scanned: number, total: number) => void,
): Promise<TFile[]> {
	const mdFiles = vault.getMarkdownFiles();
	const total = mdFiles.length;
	const results: TFile[] = [];

	// Escape path for use inside a regex
	const escapedPath = svgFilePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// Match the specific image alt depending on type
	const altText = fromType === 'inkWriting' ? 'InkWriting' : 'InkDrawing';
	const pattern = new RegExp(
		` !\\[${altText}\\]\\(<${escapedPath}>\\)`,
	);

	for (let i = 0; i < mdFiles.length; i++) {
		const file = mdFiles[i];
		try {
			const content = await vault.cachedRead(file);
			if (pattern.test(content)) {
				results.push(file);
			}
		} catch (_) {
			// Unreadable file – skip
		}
		onProgress?.(i + 1, total);
	}

	return results;
}

/**
 * Removes all v2 embed lines in a markdown note that reference the given SVG
 * file path with the given embed type. Handles multiple embeds of the same
 * file in one note.
 *
 * Returns true if the file was modified.
 */
export async function removeAllEmbedsOfFileFromNote(
	vault: Vault,
	note: TFile,
	svgFilePath: string,
	embedType: 'inkWriting' | 'inkDrawing',
): Promise<boolean> {
	let content = await vault.read(note);

	const escapedPath = svgFilePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const altText = embedType === 'inkWriting' ? 'InkWriting' : 'InkDrawing';
	// Match the full embed line (everything up to and including the newline)
	const lineRegex = new RegExp(
		` !\\[${altText}\\]\\(<${escapedPath}>\\)[^\\n]*\\r?\\n?`,
		'g',
	);

	const updated = content.replace(lineRegex, '');

	if (updated === content) return false;

	await vault.modify(note, updated);
	return true;
}

async function buildDrawingEmbedLineForConvertedFile(
	vault: Vault,
	newSvgPath: string,
): Promise<string> {
	let embedSettings: EmbedSettings | undefined;
	try {
		const svgFile = vault.getAbstractFileByPath(newSvgPath);
		if (!(svgFile instanceof TFile)) {
			return buildDrawingEmbed(newSvgPath).trim();
		}
		const svgString = await vault.read(svgFile);
		const inkFileData = extractInkJsonFromSvg(svgString);
		if (inkFileData && isInkCanvasFile(inkFileData) && inkFileData.inkCanvas) {
			embedSettings = buildDrawingEmbedSettingsFromStrokes(inkFileData.inkCanvas.strokes)
				?? undefined;
		}
	} catch {
		// Fall back to default embed settings
	}
	return buildDrawingEmbed(newSvgPath, embedSettings ? { embedSettings } : undefined).trim();
}

/**
 * Replaces all v2 embed lines in a markdown note that reference oldSvgPath
 * (of fromType) with a new embed for newSvgPath of toType.
 *
 * Returns true if the file was modified.
 */
export async function updateEmbedInNote(
	vault: Vault,
	note: TFile,
	oldSvgPath: string,
	newSvgPath: string,
	toType: 'inkWriting' | 'inkDrawing',
): Promise<boolean> {
	let content = await vault.read(note);

	const escapedOldPath = oldSvgPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const fromAlt = toType === 'inkWriting' ? 'InkDrawing' : 'InkWriting';
	// Match the full embed line (everything up to end of line)
	const lineRegex = new RegExp(
		` !\\[${fromAlt}\\]\\(<${escapedOldPath}>\\)[^\n]*`,
		'g',
	);

	const newEmbedLine = toType === 'inkWriting'
		? buildWritingEmbed(newSvgPath).trim()
		: await buildDrawingEmbedLineForConvertedFile(vault, newSvgPath);

	const updated = content.replace(lineRegex, ` ${newEmbedLine}`);

	if (updated === content) return false;

	await vault.modify(note, updated);
	return true;
}

function resolveNotesToUpdate(
	scope: FileConversionScope,
	affectedNotes: TFile[],
): TFile[] {
	if (scope.mode === 'in-place') {
		return affectedNotes;
	}
	if (scope.embedUpdate === 'none') {
		return [];
	}
	if (scope.embedUpdate === 'all-affected') {
		return affectedNotes;
	}
	if (scope.embedUpdate === 'instigating-only' && scope.instigatingNote) {
		return [scope.instigatingNote];
	}
	return [];
}

async function duplicateFileForConversion(
	plugin: InkPlugin,
	file: TFile,
	toType: 'inkWriting' | 'inkDrawing',
	instigatingNote?: TFile,
): Promise<TFile | null> {
	const fromType = toType === 'inkDrawing' ? 'inkWriting' : 'inkDrawing';
	if (fromType === 'inkDrawing') {
		return duplicateDrawingFile(plugin, file, instigatingNote);
	}
	return duplicateWritingFile(plugin, file, instigatingNote);
}

/**
 * Performs the full file conversion:
 * 1. (Optional) duplicate the file (duplicate scope only).
 * 2. (Optional) Moves the SVG file to moveToPath.
 * 3. Converts the SVG content (write↔draw).
 * 4. Updates note embeds per scope.
 *
 * onProgress(done, total) is called after each step.
 */
export async function executeFileConversion(
	plugin: InkPlugin,
	file: TFile,
	toType: 'inkWriting' | 'inkDrawing',
	affectedNotes: TFile[],
	moveToPath: string | null,
	scope: FileConversionScope,
	onProgress: (done: number, total: number) => void,
): Promise<FileConversionResult> {
	const vault = plugin.app.vault;
	const notesToUpdate = resolveNotesToUpdate(scope, affectedNotes);
	const wasDuplicated = scope.mode === 'duplicate';

	// Total steps: (duplicate = 1 if applicable) + (move = 1 if applicable) + 1 SVG conversion + 1 per note
	const duplicateStep = wasDuplicated ? 1 : 0;
	const moveStep = moveToPath ? 1 : 0;
	const total = duplicateStep + moveStep + 1 + notesToUpdate.length;
	let done = 0;

	const result: FileConversionResult = {
		updatedNotePaths: [],
		failed: [],
		finalFile: null,
		originalFilePath: file.path,
		wasDuplicated,
	};

	const oldPath = file.path;
	let currentFile = file;

	if (wasDuplicated) {
		try {
			const copy = await duplicateFileForConversion(
				plugin,
				file,
				toType,
				scope.instigatingNote,
			);
			if (!copy) {
				result.failed.push('Duplicate failed: could not create copy');
				return result;
			}
			currentFile = copy;
		} catch (err) {
			result.failed.push(`Duplicate failed: ${String(err)}`);
			return result;
		}
		done++;
		onProgress(done, total);
	} else {
		// Close any open ink views to prevent them from overwriting the converted file
		closeLeavesWithFileOpen(plugin, oldPath);
	}

	// Step: Move file if requested
	if (moveToPath) {
		try {
			await vault.rename(currentFile, moveToPath);
			currentFile = vault.getFileByPath(moveToPath) ?? currentFile;
		} catch (err) {
			result.failed.push(`Move failed: ${String(err)}`);
		}
		done++;
		onProgress(done, total);
	}

	const newPath = currentFile.path;

	if (wasDuplicated) {
		closeLeavesWithFileOpen(plugin, newPath);
	}

	// Step: Convert the SVG file content
	let svgConversionSucceeded = true;
	try {
		if (toType === 'inkDrawing') {
			await convertWriteFileToDraw(plugin, currentFile);
		} else {
			await convertDrawFileToWrite(plugin, currentFile);
		}
	} catch (err) {
		svgConversionSucceeded = false;
		result.failed.push(`SVG conversion failed: ${String(err)}`);
	}
	done++;
	onProgress(done, total);

	if (!svgConversionSucceeded) {
		result.finalFile = currentFile;
		return result;
	}

	// Step: Update embed strings in each selected note (always match against original path)
	for (const note of notesToUpdate) {
		try {
			await updateEmbedInNote(vault, note, oldPath, newPath, toType);
			result.updatedNotePaths.push(note.path);
		} catch (err) {
			result.failed.push(`${note.path}: ${String(err)}`);
		}
		done++;
		onProgress(done, total);
	}

	result.finalFile = currentFile;
	return result;
}
