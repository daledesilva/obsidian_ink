jest.mock('obsidian', () => {
	const { StateField } = jest.requireActual('@codemirror/state');
	return {
		MarkdownView: class {},
		TFile: class {},
		editorLivePreviewField: StateField.define({
			create: () => true,
			update: (value: boolean) => value,
		}),
	};
});

import { EditorState } from '@codemirror/state';
import { editorLivePreviewField, MarkdownView } from 'obsidian';
import {
	getInkEmbedHost,
	inkEmbedSourcePathFacet,
} from 'src/components/formats/current/ink-embeds-extension/ink-embed-host';
import type InkPlugin from 'src/main';

function makePlugin(activeView: unknown = null) {
	const getActiveViewOfType = jest.fn(() => activeView);
	const plugin = {
		app: {
			vault: {
				getFileByPath: (path: string) => (path === 'Cards/Card.md' ? { path } : null),
			},
			workspace: { getActiveViewOfType },
		},
	} as unknown as InkPlugin;
	return { plugin, getActiveViewOfType };
}

describe('getInkEmbedHost', () => {
	it('uses the source path and own live preview state of an editor outside a MarkdownView', () => {
		const { plugin, getActiveViewOfType } = makePlugin();
		const state = EditorState.create({
			extensions: [inkEmbedSourcePathFacet.of('Cards/Card.md'), editorLivePreviewField],
		});

		expect(getInkEmbedHost(plugin, state)).toEqual({
			mdFile: { path: 'Cards/Card.md' },
			isLivePreview: true,
		});
		expect(getActiveViewOfType).not.toHaveBeenCalled();
	});

	it('returns no file when the source path does not resolve', () => {
		const { plugin } = makePlugin();
		const state = EditorState.create({
			extensions: [inkEmbedSourcePathFacet.of('Missing.md'), editorLivePreviewField],
		});

		expect(getInkEmbedHost(plugin, state)?.mdFile).toBeNull();
	});

	it('treats a source path editor without live preview as source mode', () => {
		const { plugin } = makePlugin();
		const state = EditorState.create({
			extensions: [inkEmbedSourcePathFacet.of('Cards/Card.md')],
		});

		expect(getInkEmbedHost(plugin, state)?.isLivePreview).toBe(false);
	});

	it('falls back to the active MarkdownView when no source path is set', () => {
		const activeState = EditorState.create({
			extensions: [editorLivePreviewField.init(() => false)],
		});
		const activeView = {
			file: { path: 'Notes/Note.md' },
			editor: { cm: { state: activeState } },
		};
		const { plugin, getActiveViewOfType } = makePlugin(activeView);

		expect(getInkEmbedHost(plugin, EditorState.create())).toEqual({
			mdFile: activeView.file,
			isLivePreview: false,
		});
		expect(getActiveViewOfType).toHaveBeenCalledWith(MarkdownView);
	});

	it('returns null without a source path or an active MarkdownView', () => {
		const { plugin } = makePlugin(null);

		expect(getInkEmbedHost(plugin, EditorState.create())).toBeNull();
	});
});
