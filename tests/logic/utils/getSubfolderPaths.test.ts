import { describe, expect, test } from '@jest/globals';
import InkPlugin from 'src/main';
import { DEFAULT_SETTINGS } from 'src/types/plugin-settings';
import { getDrawingSubfolderPath, getWritingSubfolderPath } from 'src/logic/utils/getSubfolderPaths';

////////
////////

function createMockPlugin(withCustomFolders: boolean, writingSubfolder = '', drawingSubfolder = ''): InkPlugin {
	return {
		settings: {
			customAttachmentFolders: withCustomFolders,
			writingSubfolder,
			drawingSubfolder,
		},
	} as unknown as InkPlugin;
}

describe('getWritingSubfolderPath', () => {
	test('returns the default when custom folders are off', () => {
		const plugin = createMockPlugin(false, '.ink/Writing');
		expect(getWritingSubfolderPath(plugin)).toBe(DEFAULT_SETTINGS.writingSubfolder);
	});

	test('returns the custom value when custom folders are on', () => {
		const plugin = createMockPlugin(true, 'Notes/Handwriting');
		expect(getWritingSubfolderPath(plugin)).toBe('Notes/Handwriting');
	});

	// #64: a dotted custom path used to be saved verbatim, and Obsidian then refused the folder.
	test('repairs a dotted custom path instead of letting folder creation fail', () => {
		const plugin = createMockPlugin(true, '.ink/Writing');
		expect(getWritingSubfolderPath(plugin)).toBe('ink/Writing');
	});

	test('falls back to the default when the custom value is blank', () => {
		const plugin = createMockPlugin(true, '');
		expect(getWritingSubfolderPath(plugin)).toBe('');
	});
});

describe('getDrawingSubfolderPath', () => {
	test('returns the default when custom folders are off', () => {
		const plugin = createMockPlugin(false, '', '.ink/Drawing');
		expect(getDrawingSubfolderPath(plugin)).toBe(DEFAULT_SETTINGS.drawingSubfolder);
	});

	test('returns the custom value when custom folders are on', () => {
		const plugin = createMockPlugin(true, '', 'Notes/Sketches');
		expect(getDrawingSubfolderPath(plugin)).toBe('Notes/Sketches');
	});

	test('repairs a dotted custom path', () => {
		const plugin = createMockPlugin(true, '', '.ink/Drawing');
		expect(getDrawingSubfolderPath(plugin)).toBe('ink/Drawing');
	});

	test('removes parent traversal from a custom path', () => {
		const plugin = createMockPlugin(true, '', '../Escape');
		expect(getDrawingSubfolderPath(plugin)).toBe('Escape');
	});
});
