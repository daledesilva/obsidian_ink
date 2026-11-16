import { describe, expect, test } from '@jest/globals';
import { resolveObsidianAttachmentFolderPath } from 'src/logic/utils/obsidian-attachment-folder';

////////
////////

describe('resolveObsidianAttachmentFolderPath', () => {
	// Values below were confirmed against a live Obsidian vault:
	// `/` → root, `./` → same folder as note, `./attachments` → note folder + attachments,
	// `Attachments/Ink` → fixed folder.
	describe('vault root settings', () => {
		test('treats a single forward slash as the vault root', () => {
			expect(resolveObsidianAttachmentFolderPath('/', 'Notes/Note.md')).toBeNull();
		});

		test('treats an empty setting as the vault root', () => {
			expect(resolveObsidianAttachmentFolderPath('', 'Notes/Note.md')).toBeNull();
		});

		test('treats a missing setting as the vault root', () => {
			expect(resolveObsidianAttachmentFolderPath(null, 'Notes/Note.md')).toBeNull();
			expect(resolveObsidianAttachmentFolderPath(undefined, 'Notes/Note.md')).toBeNull();
		});
	});

	describe('same folder as the note', () => {
		test('returns the note folder for "./"', () => {
			expect(resolveObsidianAttachmentFolderPath('./', 'Notes/Note.md')).toBe('Notes');
		});

		test('returns null when the note sits in the vault root', () => {
			expect(resolveObsidianAttachmentFolderPath('./', 'Note.md')).toBeNull();
		});

		test('returns null when there is no note path', () => {
			expect(resolveObsidianAttachmentFolderPath('./', null)).toBeNull();
		});
	});

	describe('subfolder of the note folder', () => {
		test('joins the note folder and the relative subfolder', () => {
			expect(resolveObsidianAttachmentFolderPath('./attachments', 'Notes/Note.md')).toBe('Notes/attachments');
		});

		test('returns just the subfolder when the note sits in the vault root', () => {
			expect(resolveObsidianAttachmentFolderPath('./attachments', 'Note.md')).toBe('attachments');
		});

		test('strips a trailing slash from the relative subfolder', () => {
			expect(resolveObsidianAttachmentFolderPath('./attachments/', 'Notes/Note.md')).toBe('Notes/attachments');
		});
	});

	describe('fixed folder', () => {
		test('returns the fixed folder regardless of note location', () => {
			expect(resolveObsidianAttachmentFolderPath('Attachments/Ink', 'Notes/Deep/Note.md')).toBe('Attachments/Ink');
		});

		test('strips a trailing slash', () => {
			expect(resolveObsidianAttachmentFolderPath('Attachments/', 'Notes/Note.md')).toBe('Attachments');
		});
	});

	describe('issue #126 regression guard', () => {
		test('a fixed folder resolves without needing the Obsidian file API', () => {
			// The bug was that Ink asked Obsidian for a path and Obsidian created the folder.
			// Resolving from the stored setting must be a pure calculation.
			const resolved = resolveObsidianAttachmentFolderPath('External Files/Attachments', 'Notes/Note.md');
			expect(resolved).toBe('External Files/Attachments');
		});
	});
});
