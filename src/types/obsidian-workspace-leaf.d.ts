/**
 * Runtime WorkspaceLeaf has a stable `id` (Obsidian API); older @types may omit it.
 */
import 'obsidian';

declare module 'obsidian' {
	interface WorkspaceLeaf {
		readonly id: string;
		/**
		 * Leaf navigation history. Present at runtime; the public typedef omits it.
		 * The view-header back button is enabled when `backHistory` is non-empty.
		 */
		history: {
			backHistory: unknown[];
			forwardHistory: unknown[];
			back(): void | Promise<void>;
			forward(): void | Promise<void>;
		};
		/** Fired when back/forward history changes (same event the view header listens to). */
		on(name: 'history-change', callback: () => void, ctx?: unknown): EventRef;
	}
}
