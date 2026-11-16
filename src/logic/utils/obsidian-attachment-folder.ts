import { parseFilepath } from "./parseFilepath";

////////
////////

/**
 * Why this exists: `fileManager.getAvailablePathForAttachment()` is the only Obsidian API that
 * reports the configured attachment folder, but it also *creates* that folder as a side effect.
 * Ink used it just to read the folder, so creating an ink file in a custom location left an
 * empty `attachments/` folder behind (#126). This module resolves the same folder from the
 * stored setting instead, with no vault writes.
 */

/** Obsidian's stored attachment-folder modes, as they appear in `app.json`. */
export const OBSIDIAN_ATTACHMENT_FOLDER_ROOT = '/';
export const OBSIDIAN_ATTACHMENT_FOLDER_SAME_FOLDER = './';

/**
 * Resolves the vault-relative attachment folder Obsidian would use for an attachment.
 *
 * Obsidian's `attachmentFolderPath` setting holds one of:
 * - `/` or an empty string — vault root
 * - `./` — the same folder as the note the attachment belongs to
 * - `./sub` — a subfolder of that note's folder
 * - anything else — a fixed vault-relative folder
 *
 * Returns `null` when the attachment lands in the vault root, so callers can treat "no folder"
 * as an empty path rather than the string `/`.
 */
export function resolveObsidianAttachmentFolderPath(
	configValue: string | null | undefined,
	sourceNotePath: string | null | undefined,
): string | null {
	const setting = (configValue ?? '').trim();

	const isRootSetting = setting === '' || setting === OBSIDIAN_ATTACHMENT_FOLDER_ROOT;
	if (isRootSetting) return null;

	if (setting === OBSIDIAN_ATTACHMENT_FOLDER_SAME_FOLDER) {
		return sourceNoteFolderPath(sourceNotePath);
	}

	const isRelativeSetting = setting.startsWith(OBSIDIAN_ATTACHMENT_FOLDER_SAME_FOLDER);
	if (isRelativeSetting) {
		const relativePart = setting.slice(OBSIDIAN_ATTACHMENT_FOLDER_SAME_FOLDER.length);
		const noteFolder = sourceNoteFolderPath(sourceNotePath);
		if (relativePart.length === 0) return noteFolder;

		if (!noteFolder) return relativePart.replace(/\/+$/, '');
		return `${noteFolder}/${relativePart.replace(/\/+$/, '')}`;
	}

	return setting.replace(/\/+$/, '');
}

/** Folder containing the note, or `null` when the note is in the vault root / unknown. */
function sourceNoteFolderPath(sourceNotePath: string | null | undefined): string | null {
	if (!sourceNotePath) return null;
	const folderPath = parseFilepath(sourceNotePath).folderpath;
	if (!folderPath || folderPath === OBSIDIAN_ATTACHMENT_FOLDER_ROOT) return null;
	return folderPath;
}
