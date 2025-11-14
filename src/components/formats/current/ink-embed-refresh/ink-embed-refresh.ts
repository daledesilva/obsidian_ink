import { EditorView, ViewPlugin } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { refreshWritingEmbedsNow } from '../writing/writing-embed-extension/writing-embed-extension';
import { refreshDrawingEmbedsNow } from '../drawing/drawing-embed-extension/drawing-embed-extension';

export function inkEmbedRefreshExtension(): Extension {
	// Refresh while scrolling: fire every 250ms during scroll; stop when scrolling settles
	const RefreshOnScrollPlugin = ViewPlugin.fromClass(class {
		private intervalId: number | undefined;
		private settleTimer: number | undefined;
		private readonly refreshMs = 250;
		private readonly settleMs = 250;
		private scrollHandler: () => void;

		constructor(private view: EditorView) {
			this.scrollHandler = () => {
				this.startRefreshingIfNeeded();
				this.resetSettleTimer();
			};
			this.view.scrollDOM.addEventListener('scroll', this.scrollHandler, { passive: true });
		}

		private startRefreshingIfNeeded() {
			if (this.intervalId !== undefined) return;
			this.tick();
			this.intervalId = window.setInterval(() => this.tick(), this.refreshMs);
		}

		private tick() {
            console.log('[ink] refreshing ink embeds');
			refreshWritingEmbedsNow();
			refreshDrawingEmbedsNow();
		}

		private resetSettleTimer() {
			if (this.settleTimer !== undefined) {
				window.clearTimeout(this.settleTimer);
			}
			this.settleTimer = window.setTimeout(() => this.stopRefreshing(), this.settleMs);
		}

		private stopRefreshing() {
			if (this.intervalId !== undefined) {
				window.clearInterval(this.intervalId);
				this.intervalId = undefined;
			}
			if (this.settleTimer !== undefined) {
				window.clearTimeout(this.settleTimer);
				this.settleTimer = undefined;
			}
		}

		destroy() {
			this.view.scrollDOM.removeEventListener('scroll', this.scrollHandler);
			this.stopRefreshing();
		}
	});
	return [RefreshOnScrollPlugin];
}


