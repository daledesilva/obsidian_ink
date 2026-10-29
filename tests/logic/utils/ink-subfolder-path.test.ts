import { describe, expect, test } from '@jest/globals';
import {
	describeInkSubfolderPathChange,
	sanitiseInkSubfolderPath,
} from 'src/logic/utils/ink-subfolder-path';

////////
////////

describe('sanitiseInkSubfolderPath', () => {
	// #64: `.ink/Writing` saved without error but Obsidian never created the folder.
	test('strips leading dots from folder segments', () => {
		const result = sanitiseInkSubfolderPath('.ink/Writing');
		expect(result.path).toBe('ink/Writing');
		expect(result.wasChanged).toBe(true);
		expect(result.reason).toBe('leading-dot-segment');
	});

	test('strips a single leading dot', () => {
		expect(sanitiseInkSubfolderPath('.Ink').path).toBe('Ink');
	});

	test('strips multiple leading dots', () => {
		expect(sanitiseInkSubfolderPath('...Ink/Drawing').path).toBe('Ink/Drawing');
	});

	test('leaves an already-valid path untouched', () => {
		const result = sanitiseInkSubfolderPath('Ink/Writing');
		expect(result.path).toBe('Ink/Writing');
		expect(result.wasChanged).toBe(false);
		expect(result.reason).toBeNull();
	});

	test('drops a segment that is only dots', () => {
		expect(sanitiseInkSubfolderPath('Ink/.../Writing').path).toBe('Ink/Writing');
	});

	test('removes parent traversal so files cannot escape the base folder', () => {
		const result = sanitiseInkSubfolderPath('../../etc');
		expect(result.path).toBe('etc');
		expect(result.reason).toBe('parent-traversal');
	});

	test('removes internal parent traversal but keeps the rest', () => {
		expect(sanitiseInkSubfolderPath('Ink/../Writing').path).toBe('Ink/Writing');
	});

	test('converts backslashes to forward slashes', () => {
		const result = sanitiseInkSubfolderPath('Ink\\Writing');
		expect(result.path).toBe('Ink/Writing');
		expect(result.reason).toBe('backslash');
	});

	test('collapses repeated and trailing slashes', () => {
		expect(sanitiseInkSubfolderPath('Ink//Writing/').path).toBe('Ink/Writing');
	});

	test('trims surrounding whitespace', () => {
		expect(sanitiseInkSubfolderPath('  Ink/Writing  ').path).toBe('Ink/Writing');
	});

	test('returns an empty path for empty input so files land in the base folder', () => {
		const result = sanitiseInkSubfolderPath('');
		expect(result.path).toBe('');
		expect(result.wasChanged).toBe(false);
	});

	test('returns an empty path when the input is only slashes', () => {
		expect(sanitiseInkSubfolderPath('///').path).toBe('');
	});

	test('reports no change for the default settings values', () => {
		expect(sanitiseInkSubfolderPath('Ink/Writing').wasChanged).toBe(false);
		expect(sanitiseInkSubfolderPath('Ink/Drawing').wasChanged).toBe(false);
	});

	test('reports the first reason found when several changes are needed', () => {
		const result = sanitiseInkSubfolderPath('.ink\\..\\Writing');
		expect(result.reason).toBe('backslash');
		expect(result.path).toBe('ink/Writing');
	});
});

describe('describeInkSubfolderPathChange', () => {
	test('returns null when nothing changed', () => {
		expect(describeInkSubfolderPathChange(sanitiseInkSubfolderPath('Ink/Writing'))).toBeNull();
	});

	test('explains the dotted-folder repair', () => {
		const explanation = describeInkSubfolderPathChange(sanitiseInkSubfolderPath('.ink/Writing'));
		expect(explanation).toContain('dot');
	});

	test('explains the parent-traversal repair', () => {
		const explanation = describeInkSubfolderPathChange(sanitiseInkSubfolderPath('../Ink'));
		expect(explanation).toContain('outside the vault');
	});
});
