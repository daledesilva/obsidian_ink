import { Editor } from 'obsidian';
import InkPlugin from 'src/main';

// Non-anchored global regex — finds ink embed settings URLs anywhere in pasted text
const INK_EMBED_REGEX = / !\[Ink(?:Writing|Drawing)\]\(<([^>]+)>\) \[Edit (?:Writing|Drawing)\]\(([^)]+)\)/g;

/**
 * Pure transformation: injects &pendingPaste=true into every ink embed found in the text.
 * Returns null if no ink embeds are found (so callers can skip preventDefault).
 */
export function injectPendingPasteIntoEmbeds(text: string): string | null {
	let foundEmbeds = false;
	const modified = text.replace(INK_EMBED_REGEX, (fullMatch, _filepath, settingsUrl) => {
		foundEmbeds = true;
		return fullMatch.replace(`(${settingsUrl})`, `(${settingsUrl}&pendingPaste=true)`);
	});
	return foundEmbeds ? modified : null;
}

export function registerPasteEmbedHandler(plugin: InkPlugin): void {
	plugin.registerEvent(plugin.app.workspace.on('editor-paste', (evt: ClipboardEvent, editor: Editor) => {
		const clipboardText = evt.clipboardData?.getData('text/plain');
		if (!clipboardText) return;

		const modifiedText = injectPendingPasteIntoEmbeds(clipboardText);
		if (!modifiedText) return;

		evt.preventDefault();
		editor.replaceSelection(modifiedText);
	}));
}
