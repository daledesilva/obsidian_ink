/**
 * Runtime WorkspaceLeaf has a stable `id` (Obsidian API); older @types may omit it.
 */
import 'obsidian';

declare module 'obsidian' {
	interface WorkspaceLeaf {
		readonly id: string;
	}
}
