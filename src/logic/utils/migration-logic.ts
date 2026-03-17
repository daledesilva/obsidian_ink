import { TFile, Vault } from "obsidian";
import { PLUGIN_VERSION, TLDRAW_VERSION, WRITE_EMBED_KEY, DRAW_EMBED_KEY } from "src/constants";
import { InkFileData } from "src/components/formats/current/types/file-data";
import { InkFileData_v1 } from "src/components/formats/v1-code-blocks/types/file-data";
import { buildFileStr } from "src/components/formats/current/utils/buildFileStr";
import { buildWritingEmbed, buildDrawingEmbed } from "src/components/formats/current/utils/build-embeds";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const emptyWritingSvgStr: string = require('src/defaults/empty-writing-embed.svg');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const emptyDrawingSvgStr: string = require('src/defaults/empty-drawing-embed.svg');

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
			const data = JSON.parse(jsonContent);
			if (typeof data.filepath === 'string' && data.filepath.length > 0) {
				results.push({ fullMatch, embedType, filepath: data.filepath });
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
 * Converts a legacy v1 JSON file string into current-format InkFileData.
 * Returns null if the JSON cannot be parsed.
 * The SVG string will be a placeholder (previewIsOutdated is set to true).
 */
export function convertLegacyJsonToInkFileData(
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

	const inkFileType = fileType === 'writing' ? 'inkWriting' : 'inkDrawing';
	const svgString = fileType === 'writing' ? emptyWritingSvgStr : emptyDrawingSvgStr;

	return {
		meta: {
			pluginVersion: legacyData.meta.pluginVersion || PLUGIN_VERSION,
			tldrawVersion: legacyData.meta.tldrawVersion || TLDRAW_VERSION,
			fileType: inkFileType,
			transcript: legacyData.meta.transcript,
			previewIsOutdated: true,
		},
		tldraw: legacyData.tldraw,
		svgString,
	};
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

/**
 * Scans the entire vault for legacy ink embeds.
 * Returns a VaultScanResult with the legacy files to convert and the notes to update.
 * Calls onProgress(scanned, total) after each markdown file is processed.
 */
export async function scanVaultForLegacyEmbeds(
	vault: Vault,
	onProgress?: (scanned: number, total: number) => void,
): Promise<VaultScanResult> {
	const markdownFiles = vault.getMarkdownFiles();
	const total = markdownFiles.length;

	// legacyFilePath -> LegacyFileScanResult
	const legacyFileMap = new Map<string, LegacyFileScanResult>();
	// Set of markdown file paths that reference legacy embeds
	const affectedNoteSet = new Map<string, TFile>();

	for (let i = 0; i < markdownFiles.length; i++) {
		const note = markdownFiles[i];
		let content: string;

		try {
			content = await vault.read(note);
		} catch (_) {
			onProgress?.(i + 1, total);
			continue;
		}

		const blocks = findLegacyEmbedBlocks(content);
		if (blocks.length === 0) {
			onProgress?.(i + 1, total);
			continue;
		}

		affectedNoteSet.set(note.path, note);

		for (const block of blocks) {
			if (!legacyFileMap.has(block.filepath)) {
				const legacyFile = vault.getAbstractFileByPath(block.filepath);
				if (legacyFile instanceof TFile) {
					legacyFileMap.set(block.filepath, {
						legacyFile,
						fileType: block.embedType,
						newSvgPath: getLegacySvgPath(block.filepath),
						referencingNotes: [],
					});
				}
			}

			const entry = legacyFileMap.get(block.filepath);
			if (entry && !entry.referencingNotes.find(n => n.path === note.path)) {
				entry.referencingNotes.push(note);
			}
		}

		onProgress?.(i + 1, total);
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
};

/**
 * Executes the migration: converts each legacy file to SVG and updates referencing notes.
 * Calls onProgress(done, total) after each step.
 */
export async function executeMigration(
	vault: Vault,
	scanResult: VaultScanResult,
	onProgress?: (done: number, total: number) => void,
): Promise<MigrationResult> {
	const result: MigrationResult = { convertedFiles: 0, updatedNotes: 0, updatedNotePaths: [], skipped: [], failed: [] };
	const total = scanResult.legacyFiles.length + scanResult.affectedNotes.length;
	let done = 0;

	// Step 1: Convert each legacy file to SVG
	for (const entry of scanResult.legacyFiles) {
		try {
			const legacyJson = await vault.read(entry.legacyFile);
			const inkFileData = convertLegacyJsonToInkFileData(legacyJson, entry.fileType);

			if (!inkFileData) {
				result.skipped.push(entry.legacyFile.path + ' (could not parse)');
				done++;
				onProgress?.(done, total);
				continue;
			}

			// Check if SVG file already exists
			const existing = vault.getAbstractFileByPath(entry.newSvgPath);
			if (existing instanceof TFile) {
				result.skipped.push(entry.newSvgPath + ' (already exists)');
				done++;
				onProgress?.(done, total);
				continue;
			}

			const svgStr = buildFileStr(inkFileData);
			await vault.create(entry.newSvgPath, svgStr);
			await vault.delete(entry.legacyFile);
			result.convertedFiles++;
		} catch (err: any) {
			result.failed.push(entry.legacyFile.path + ': ' + (err?.message ?? String(err)));
		}

		done++;
		onProgress?.(done, total);
	}

	// Step 2: Update markdown notes
	for (const note of scanResult.affectedNotes) {
		try {
			let content = await vault.read(note);
			const blocks = findLegacyEmbedBlocks(content);

			for (const block of blocks) {
				const newSvgPath = getLegacySvgPath(block.filepath);
				const newEmbed =
					block.embedType === 'writing'
						? buildWritingEmbed(newSvgPath)
						: buildDrawingEmbed(newSvgPath);
				content = replaceLegacyBlockInMarkdown(content, block, newEmbed);
			}

		await vault.modify(note, content);
		result.updatedNotes++;
		result.updatedNotePaths.push(note.path);
		} catch (err: any) {
			result.failed.push(note.path + ': ' + (err?.message ?? String(err)));
		}

		done++;
		onProgress?.(done, total);
	}

	return result;
}
