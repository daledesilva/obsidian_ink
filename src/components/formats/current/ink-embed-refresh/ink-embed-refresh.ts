import { EditorView, ViewPlugin } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { refreshWritingEmbedsNow } from '../writing/writing-embed-extension/writing-embed-extension';
import { refreshDrawingEmbedsNow } from '../drawing/drawing-embed-extension/drawing-embed-extension';

export function inkEmbedRefreshExtension(): Extension {
	// Single interval per editor view that triggers both writing and drawing refresh
	const RefreshPlugin = ViewPlugin.fromClass(class {
		private intervalId: number | undefined;
		constructor(private view: EditorView) {
			this.intervalId = window.setInterval(() => {
				// Call refresh functions; they dispatch effects to rebuild decorations
                console.log('[ink] refreshing ink embeds');
				refreshWritingEmbedsNow();
				refreshDrawingEmbedsNow();
			}, 5000);
		}
		destroy() {
			if (this.intervalId !== undefined) {
				window.clearInterval(this.intervalId);
			}
		}
	});
	return [RefreshPlugin];
}


