import { TFile, Vault } from "obsidian";
import InkPlugin from "src/main";
import { buildWritingEmbed, buildDrawingEmbed } from "src/components/formats/current/utils/build-embeds";
import { convertWriteFileToDraw } from "src/components/formats/current/utils/convertWriteFileToDraw";
import { convertDrawFileToWrite } from "src/components/formats/current/utils/convertDrawFileToWrite";
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

export type FileConversionResult = {
	updatedNotePaths: string[];
	failed: string[];
	/** The file at its final path after conversion (and optional move). */
	finalFile: TFile | null;
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
		: buildDrawingEmbed(newSvgPath).trim();

	const updated = content.replace(lineRegex, ` ${newEmbedLine}`);

	if (updated === content) return false;

	await vault.modify(note, updated);
	return true;
}

/**
 * Performs the full file conversion:
 * 1. (Optional) Moves the SVG file to moveToPath.
 * 2. Converts the SVG content (write↔draw).
 * 3. Updates all affected note embeds to point at the new path with the new type.
 *
 * onProgress(done, total) is called after each step.
 */
export async function executeFileConversion(
	plugin: InkPlugin,
	file: TFile,
	toType: 'inkWriting' | 'inkDrawing',
	affectedNotes: TFile[],
	moveToPath: string | null,
	onProgress: (done: number, total: number) => void,
): Promise<FileConversionResult> {
	const vault = plugin.app.vault;
	// Total steps: (move = 1 if applicable) + 1 SVG conversion + 1 per note
	const moveStep = moveToPath ? 1 : 0;
	const total = moveStep + 1 + affectedNotes.length;
	let done = 0;

	const result: FileConversionResult = {
		updatedNotePaths: [],
		failed: [],
		finalFile: null,
	};

	const oldPath = file.path;
	let currentFile = file;

	// Close any open ink views to prevent them from overwriting the converted file
	closeLeavesWithFileOpen(plugin, oldPath);

	// Step 1: Move file if requested
	if (moveToPath) {
		try {
			await vault.rename(file, moveToPath);
			// After rename, the TFile object is still valid but its path is updated
			currentFile = vault.getFileByPath(moveToPath) ?? file;
		} catch (err) {
			result.failed.push(`Move failed: ${String(err)}`);
		}
		done++;
		onProgress(done, total);
	}

	const newPath = currentFile.path;

	// Step 2: Convert the SVG file content
	try {
		if (toType === 'inkDrawing') {
			await convertWriteFileToDraw(plugin, currentFile);
		} else {
			await convertDrawFileToWrite(plugin, currentFile);
		}
	} catch (err) {
		result.failed.push(`SVG conversion failed: ${String(err)}`);
	}
	done++;
	onProgress(done, total);

	// Step 3: Update embed strings in each affected note
	for (const note of affectedNotes) {
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
