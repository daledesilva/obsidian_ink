import type { InkCommand } from './commands';

///////////////////////////
///////////////////////////

export type UndoManagerEvent = 'execute' | 'undo' | 'redo' | 'clear';

export type UndoManagerListener = (event: UndoManagerEvent) => void;

/**
 * Command-pattern undo/redo manager. Executes commands, tracks history, and
 * supports undo/redo. Notifies listeners after every state change so the UI
 * and the unified Obsidian undo stack can stay in sync.
 */
export class UndoManager {
	private undoStack: InkCommand[] = [];
	private redoStack: InkCommand[] = [];
	private listeners: Set<UndoManagerListener> = new Set();

	subscribe(listener: UndoManagerListener): () => void {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	}

	private notify(event: UndoManagerEvent): void {
		for (const listener of this.listeners) {
			listener(event);
		}
	}

	/** Execute a command, push it onto the undo stack, and clear redo. */
	execute(command: InkCommand): void {
		command.apply();
		this.undoStack.push(command);
		this.redoStack = [];
		this.notify('execute');
	}

	undo(): void {
		const command = this.undoStack.pop();
		if (!command) return;
		command.unapply();
		this.redoStack.push(command);
		this.notify('undo');
	}

	redo(): void {
		const command = this.redoStack.pop();
		if (!command) return;
		command.apply();
		this.undoStack.push(command);
		this.notify('redo');
	}

	canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	getUndoCount(): number {
		return this.undoStack.length;
	}

	getRedoCount(): number {
		return this.redoStack.length;
	}

	clear(): void {
		this.undoStack = [];
		this.redoStack = [];
		this.notify('clear');
	}
}
