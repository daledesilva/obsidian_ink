/**
 * Unit tests for unified-commands.ts (plugin commands -> synthetic undo/redo keydown)
 * @see docs/undo-redo-implementation.md
 */

import type InkPlugin from 'src/main';
import {
	dispatchSyntheticRedoKeydown,
	dispatchSyntheticUndoKeydown,
	registerUnifiedUndoRedoCommands,
} from 'src/logic/undo-redo/unified-commands';

function createMockPlugin() {
	const commands: any[] = [];

	const plugin = {
		addCommand: jest.fn((command) => {
			commands.push(command);
			return command;
		}),
	} as unknown as InkPlugin;

	return { plugin, commands };
}

describe('unified-commands', () => {
	beforeEach(() => {
		jest.restoreAllMocks();
		document.body.innerHTML = '';
	});

	it('registers unified undo/redo commands', () => {
		const { plugin, commands } = createMockPlugin();
		registerUnifiedUndoRedoCommands(plugin);

		expect(commands.map((command) => command.id)).toEqual([
			'unified-undo',
			'unified-redo',
		]);
		expect(commands.map((command) => command.name)).toEqual([
			'Unified undo',
			'Unified redo',
		]);
	});

	it('dispatches undo keydown on document (cancelable bubbling)', () => {
		const cmEditor = document.createElement('div');
		cmEditor.className = 'cm-editor';
		const child = document.createElement('button');
		cmEditor.appendChild(child);
		document.body.appendChild(cmEditor);

		// Prevent default so unified-commands returns early without needing plugin.app.
		document.addEventListener('keydown', (event: KeyboardEvent) => event.preventDefault(), { capture: true, once: true });

		const eventListener = jest.fn();
		document.addEventListener('keydown', eventListener, { once: true });
		child.focus();

		dispatchSyntheticUndoKeydown({} as InkPlugin);

		expect(eventListener).toHaveBeenCalledTimes(1);
		const event = eventListener.mock.calls[0][0] as KeyboardEvent;
		expect(event.key).toBe('z');
		expect(event.code).toBe('KeyZ');
		expect(event.shiftKey).toBe(false);
		expect(event.metaKey || event.ctrlKey).toBe(true);
		expect(event.bubbles).toBe(true);
		expect(event.cancelable).toBe(true);
	});

	it('dispatches redo keydown on document (cancelable bubbling)', () => {
		const cmEditor = document.createElement('div');
		cmEditor.className = 'cm-editor';
		document.body.appendChild(cmEditor);

		// Prevent default so unified-commands returns early without needing plugin.app.
		document.addEventListener('keydown', (event: KeyboardEvent) => event.preventDefault(), { capture: true, once: true });

		const eventListener = jest.fn();
		document.addEventListener('keydown', eventListener, { once: true });

		dispatchSyntheticRedoKeydown({} as InkPlugin);

		expect(eventListener).toHaveBeenCalledTimes(1);
		const event = eventListener.mock.calls[0][0] as KeyboardEvent;
		expect(event.key).toBe('z');
		expect(event.code).toBe('KeyZ');
		expect(event.shiftKey).toBe(true);
		expect(event.metaKey || event.ctrlKey).toBe(true);
	});

	it('does not call Obsidian editor.undo when the unified keydown handler intercepts (preventDefault)', () => {
		const unifiedKeydownHandler = jest.fn((event: KeyboardEvent) => {
			event.preventDefault();
		});
		document.addEventListener('keydown', unifiedKeydownHandler, { capture: true, once: true });

		const undo = jest.fn();
		const redo = jest.fn();
		const plugin = {
			app: {
				workspace: {
					getActiveViewOfType: jest.fn(() => ({ editor: { undo, redo } })),
				},
			},
		} as unknown as InkPlugin;

		const eventListener = jest.fn();
		document.addEventListener('keydown', eventListener, { once: true });

		dispatchSyntheticUndoKeydown(plugin);

		expect(unifiedKeydownHandler).toHaveBeenCalledTimes(1);
		expect(undo).toHaveBeenCalledTimes(0);
		expect(redo).toHaveBeenCalledTimes(0);
		expect(eventListener).toHaveBeenCalledTimes(1);
		expect((eventListener.mock.calls[0][0] as KeyboardEvent).defaultPrevented).toBe(true);
	});

	it('calls Obsidian editor.undo directly when synthetic event is not intercepted', () => {
		const undo = jest.fn();
		const redo = jest.fn();
		const plugin = {
			app: {
				workspace: {
					getActiveViewOfType: jest.fn(() => ({ editor: { undo, redo } })),
				},
			},
		} as unknown as InkPlugin;

		const eventListener = jest.fn();
		document.addEventListener('keydown', eventListener, { once: true });

		dispatchSyntheticUndoKeydown(plugin);

		expect(undo).toHaveBeenCalledTimes(1);
		expect(redo).toHaveBeenCalledTimes(0);
		expect(eventListener).toHaveBeenCalledTimes(1);
	});

	it('calls Obsidian editor.redo directly when synthetic event is not intercepted', () => {
		const undo = jest.fn();
		const redo = jest.fn();
		const plugin = {
			app: {
				workspace: {
					getActiveViewOfType: jest.fn(() => ({ editor: { undo, redo } })),
				},
			},
		} as unknown as InkPlugin;

		const eventListener = jest.fn();
		document.addEventListener('keydown', eventListener, { once: true });

		dispatchSyntheticRedoKeydown(plugin);

		expect(undo).toHaveBeenCalledTimes(0);
		expect(redo).toHaveBeenCalledTimes(1);
		expect(eventListener).toHaveBeenCalledTimes(1);
	});

	it('does nothing when no MarkdownView editor exists', () => {
		const plugin = {
			app: {
				workspace: {
					getActiveViewOfType: jest.fn(() => null),
				},
			},
		} as unknown as InkPlugin;

		const eventListener = jest.fn();
		document.addEventListener('keydown', eventListener);

		expect(() => dispatchSyntheticUndoKeydown(plugin)).not.toThrow();
		expect(() => dispatchSyntheticRedoKeydown(plugin)).not.toThrow();
		expect(eventListener).toHaveBeenCalledTimes(2);
	});
});

