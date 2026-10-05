import { Editor, MarkdownView, TFile } from 'obsidian';
import { Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import InkPlugin from 'src/main';
import {
	patchDrawingEmbedTranscriptInEmbedSnippet,
	patchWritingEmbedTranscriptInEmbedSnippet,
} from 'src/components/formats/current/utils/build-embeds';
import type { HandwritingTranscriptionFileType } from 'src/logic/handwriting-transcription-queue-store';

//////////
//////////

/**
 * Finds markdown notes that embed the SVG (any image alt, matching ink type in the edit URL).
 */
export async function findNotesContainingInkEmbedAnyAlt(
	plugin: InkPlugin,
	svgFilePath: string,
	fileType: HandwritingTranscriptionFileType,
): Promise<TFile[]> {
	const mdFiles = plugin.app.vault.getMarkdownFiles();
	const pattern = buildInkEmbedAnyAltPattern(svgFilePath, fileType);
	const results: TFile[] = [];
	for (const file of mdFiles) {
		try {
			const content = await plugin.app.vault.cachedRead(file);
			if (pattern.test(content)) results.push(file);
		} catch {
			// Unreadable file — skip
		}
	}
	return results;
}

/**
 * Writes stripped transcript alt onto every matching writing or drawing embed in the vault.
 */
export async function patchInkEmbedTranscriptAltsInVault(
	plugin: InkPlugin,
	svgFilePath: string,
	fileType: HandwritingTranscriptionFileType,
	transcript: string,
): Promise<void> {
	const notes = await findNotesContainingInkEmbedAnyAlt(plugin, svgFilePath, fileType);
	for (const note of notes) {
		const patchedInOpenEditor = patchInkEmbedTranscriptAltsInOpenMarkdownEditor(
			plugin,
			note,
			svgFilePath,
			fileType,
			transcript,
		);
		if (patchedInOpenEditor) continue;
		await patchInkEmbedTranscriptAltsInClosedNote(plugin, note, svgFilePath, fileType, transcript);
	}
}

/**
 * Replaces `![alt](<svgPath>)` on ink embed lines of the given type.
 */
export function patchInkEmbedTranscriptAltsInMarkdown(
	markdown: string,
	svgFilePath: string,
	fileType: HandwritingTranscriptionFileType,
	transcript: string,
): string {
	const pattern = buildInkEmbedAnyAltPattern(svgFilePath, fileType, true);
	return markdown.replace(pattern, (embedSnippet) => {
		if (fileType === 'inkWriting') {
			return patchWritingEmbedTranscriptInEmbedSnippet(embedSnippet, transcript);
		}
		return patchDrawingEmbedTranscriptInEmbedSnippet(embedSnippet, transcript);
	});
}

/**
 * One `![alt]` replacement. Offsets are in the note text before any of these edits.
 */
interface InkEmbedAltChange {
	from: number;
	to: number;
	insert: string;
}

/**
 * Alt-only hunks for each matching embed. Separate hunks so text between two copies
 * of the same SVG is not part of the change, and so the edit stops at `![…]`.
 */
function listInkEmbedTranscriptAltChanges(
	markdown: string,
	svgFilePath: string,
	fileType: HandwritingTranscriptionFileType,
	transcript: string,
): InkEmbedAltChange[] {
	const pattern = buildInkEmbedAnyAltPattern(svgFilePath, fileType, true);
	const changes: InkEmbedAltChange[] = [];
	for (const match of markdown.matchAll(pattern)) {
		const snippet = match[0];
		const matchIndex = match.index;
		if (matchIndex === undefined) continue;
		let patchedSnippet: string;
		if (fileType === 'inkWriting') {
			patchedSnippet = patchWritingEmbedTranscriptInEmbedSnippet(snippet, transcript);
		} else {
			patchedSnippet = patchDrawingEmbedTranscriptInEmbedSnippet(snippet, transcript);
		}
		if (patchedSnippet === snippet) continue;
		const altInSnippet = /!\[[^\]]*\]/.exec(snippet);
		const altInPatched = /!\[[^\]]*\]/.exec(patchedSnippet);
		if (!altInSnippet || altInSnippet.index === undefined || !altInPatched) continue;
		changes.push({
			from: matchIndex + altInSnippet.index,
			to: matchIndex + altInSnippet.index + altInSnippet[0].length,
			insert: altInPatched[0],
		});
	}
	return changes;
}

/**
 * Writes transcript alts in an open note without replacing the whole document.
 * A full-document change overlaps every ink widget and remounts the embed being edited.
 */
function patchInkEmbedTranscriptAltsInOpenMarkdownEditor(
	plugin: InkPlugin,
	note: TFile,
	svgFilePath: string,
	fileType: HandwritingTranscriptionFileType,
	transcript: string,
): boolean {
	const leaves = plugin.app.workspace.getLeavesOfType('markdown');
	let didFindOpenEditor = false;
	for (const leaf of leaves) {
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) continue;
		if (view.file?.path !== note.path) continue;
		const editor = view.editor;
		if (!editor) continue;
		didFindOpenEditor = true;
		const cmUnknown: unknown = Reflect.get(editor, 'cm');
		if (!cmUnknown || typeof cmUnknown !== 'object' || !('state' in cmUnknown)) {
			patchInkEmbedTranscriptAltsWithEditorReplaceRange(editor, svgFilePath, fileType, transcript);
			continue;
		}
		const cmEditorView = cmUnknown as EditorView;
		const currentText = cmEditorView.state.doc.toString();
		const changes = listInkEmbedTranscriptAltChanges(
			currentText,
			svgFilePath,
			fileType,
			transcript,
		);
		if (changes.length === 0) continue;
		// Background alt write must not become an undo step that rebuilds widgets later.
		cmEditorView.dispatch({
			changes,
			annotations: [Transaction.addToHistory.of(false)],
		});
	}
	return didFindOpenEditor;
}

/**
 * Applies alt hunks through the Obsidian editor when CodeMirror is unavailable.
 * Later hunks go first so earlier offsets stay valid.
 */
function patchInkEmbedTranscriptAltsWithEditorReplaceRange(
	editor: Editor,
	svgFilePath: string,
	fileType: HandwritingTranscriptionFileType,
	transcript: string,
): void {
	const currentText = editor.getValue();
	const changes = listInkEmbedTranscriptAltChanges(
		currentText,
		svgFilePath,
		fileType,
		transcript,
	);
	const changesFromEnd = [...changes].sort((left, right) => right.from - left.from);
	for (const change of changesFromEnd) {
		editor.replaceRange(
			change.insert,
			editorPositionAtOffset(currentText, change.from),
			editorPositionAtOffset(currentText, change.to),
		);
	}
}

/**
 * Maps a character offset to an Obsidian editor position.
 */
function editorPositionAtOffset(markdown: string, offset: number): { line: number; ch: number } {
	let line = 0;
	let lineStart = 0;
	const boundedOffset = Math.min(offset, markdown.length);
	for (let index = 0; index < boundedOffset; index += 1) {
		if (markdown.charCodeAt(index) === 10) {
			line += 1;
			lineStart = index + 1;
		}
	}
	return { line, ch: boundedOffset - lineStart };
}

async function patchInkEmbedTranscriptAltsInClosedNote(
	plugin: InkPlugin,
	note: TFile,
	svgFilePath: string,
	fileType: HandwritingTranscriptionFileType,
	transcript: string,
): Promise<void> {
	const vault = plugin.app.vault;
	if (typeof vault.process === 'function') {
		await vault.process(note, (data) => {
			return patchInkEmbedTranscriptAltsInMarkdown(data, svgFilePath, fileType, transcript);
		});
		return;
	}
	const currentText = await vault.read(note);
	const updated = patchInkEmbedTranscriptAltsInMarkdown(
		currentText,
		svgFilePath,
		fileType,
		transcript,
	);
	if (updated === currentText) return;
	await vault.modify(note, updated);
}

function buildInkEmbedAnyAltPattern(
	svgFilePath: string,
	fileType: HandwritingTranscriptionFileType,
	global = false,
): RegExp {
	const escapedPath = svgFilePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const typeToken = fileType === 'inkWriting' ? 'inkWriting' : 'inkDrawing';
	return new RegExp(
		` !\\[[^\\]]*\\]\\(<${escapedPath}>\\) \\[Edit (?:Writing|Drawing)\\]\\([^)\\n]*type=${typeToken}[^)\\n]*\\)`,
		global ? 'g' : undefined,
	);
}
