import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { MarkdownView } from 'obsidian';
import { getGlobals } from 'src/stores/global-store';
import { refreshWritingEmbedsNow } from '../writing/writing-embed-extension/writing-embed-extension';
import { refreshDrawingEmbedsNow } from '../drawing/drawing-embed-extension/drawing-embed-extension';

/**
 * InkEmbedsExtension
 * - Simple scroll-based refresh: only on down-scroll
 * - Refreshes embeds in/below viewport only
 * - No refreshes on up-scroll for smooth iPad scrolling
 */

export function inkEmbedsExtension(): Extension {
	const InkEmbedsView = ViewPlugin.fromClass(class {
		private lastScrollTop = 0;

		constructor(readonly view: EditorView) {
			this.lastScrollTop = view.scrollDOM.scrollTop;
			
			// Listen to scroll events
			this.view.scrollDOM.addEventListener('scroll', this.handleScroll);
		}

		destroy() {
			// Clean up listener
			this.view.scrollDOM.removeEventListener('scroll', this.handleScroll);
		}

	private handleScroll = () => {
		const currentScrollTop = this.view.scrollDOM.scrollTop;
		const scrollDelta = currentScrollTop - this.lastScrollTop;
		this.lastScrollTop = currentScrollTop;
		
		// Only refresh on down-scroll
		if (scrollDelta <= 0) return;
		
		// Get viewport range
		const viewportFrom = this.view.viewport.from;
		
		// Refresh with viewport info
		refreshWritingEmbedsNow(viewportFrom);
		refreshDrawingEmbedsNow(viewportFrom);
	};

		update(update: ViewUpdate) {
			// Keep this for potential future use, but scroll events are primary
		}
	});

	return [InkEmbedsView];
}

