import { Editor } from 'obsidian';
import InkPlugin from 'src/main';

// Non-anchored global regex — finds ink embed settings URLs anywhere in pasted text
const INK_EMBED_REGEX = / !\[Ink(?:Writing|Drawing)\]\(<([^>]+)>\) \[Edit (?:Writing|Drawing)\]\(([^)]+)\)/g;

export function registerPasteEmbedHandler(plugin: InkPlugin): void {
	plugin.registerEvent(plugin.app.workspace.on('editor-paste', (evt: ClipboardEvent, editor: Editor) => {
		const clipboardText = evt.clipboardData?.getData('text/plain');
		if (!clipboardText) return;

		let foundEmbeds = false;
		const modifiedText = clipboardText.replace(INK_EMBED_REGEX, (fullMatch, _filepath, settingsUrl) => {
			foundEmbeds = true;
			// Inject pendingPaste=true so each embed shows its own inline decision panel
			return fullMatch.replace(`(${settingsUrl})`, `(${settingsUrl}&pendingPaste=true)`);
		});

		if (!foundEmbeds) return;

		evt.preventDefault();
		editor.replaceSelection(modifiedText);
	}));
}
