import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { MarkdownView, Notice, TFile } from 'obsidian';
import InkPlugin from 'src/main';
import { InsertCopiedFileModal } from 'src/components/dom-components/modals/confirmation-modal/insert-copied-file-modal';
import { buildWritingEmbed, buildDrawingEmbed } from 'src/components/formats/current/utils/build-embeds';
import { duplicateWritingFile, duplicateDrawingFile } from 'src/components/formats/current/utils/duplicate-files';

// Anchored so we only intercept pastes that are exclusively an ink embed string
const INK_EMBED_REGEX = /^ !\[Ink(Writing|Drawing)\]\(<([^>]+)>\) \[Edit (?:Writing|Drawing)\]\([^)]*type=ink(?:Writing|Drawing)[^)]*\)$/;

export function pasteEmbedHandler(plugin: InkPlugin): Extension {
	return EditorView.domEventHandlers({
		paste: (event: ClipboardEvent, view: EditorView) => {
			const clipboardText = event.clipboardData?.getData('text/plain');
			if (!clipboardText) return false;

			const match = clipboardText.replace(/^\n+|\n+$/g, '').match(INK_EMBED_REGEX);
			if (!match) return false;

			event.preventDefault();

			const embedType = match[1] as 'Writing' | 'Drawing';
			const filepath = match[2];
			const filetype = embedType.toLowerCase() as 'writing' | 'drawing';

			const existingFileRef = plugin.app.vault.getAbstractFileByPath(filepath);
			if (!(existingFileRef instanceof TFile)) {
				// File no longer exists — insert the raw text so it renders as a broken embed
				const cursorPos = view.state.selection.main.head;
				view.dispatch({ changes: { from: cursorPos, insert: clipboardText } });
				return true;
			}

			const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			const editor = activeView?.editor;
			if (!editor) {
				const cursorPos = view.state.selection.main.head;
				view.dispatch({ changes: { from: cursorPos, insert: clipboardText } });
				return true;
			}

			const buildEmbed = embedType === 'Writing' ? buildWritingEmbed : buildDrawingEmbed;
			const duplicateFile = embedType === 'Writing' ? duplicateWritingFile : duplicateDrawingFile;

			new InsertCopiedFileModal({
				plugin,
				filetype,
				instanceAction: () => {
					const embedStr = buildEmbed(existingFileRef.path);
					editor.replaceRange(embedStr, editor.getCursor());
				},
				duplicateAction: async () => {
					const activeFile = plugin.app.workspace.getActiveFile();
					const duplicatedFileRef = await duplicateFile(plugin, existingFileRef, activeFile);
					if (!duplicatedFileRef) return;

					new Notice(`${embedType} file duplicated`);
					const embedStr = buildEmbed(duplicatedFileRef.path);
					editor.replaceRange(embedStr, editor.getCursor());
				},
				cancelAction: () => {
					new Notice('Paste cancelled.');
				},
			}).open();

			return true;
		},
	});
}
