////////
////////

/**
 * Why {@link sanitiseInkSubfolderPath} changed what the user typed.
 * `null` means the path was already usable as-is.
 */
export type InkSubfolderPathChangeReason =
	| 'leading-dot-segment'
	| 'parent-traversal'
	| 'backslash'
	| 'extra-slash';

/** Outcome of cleaning up a user-entered Ink file-organisation subfolder. */
export interface InkSubfolderSanitisationResult {
	/** Safe vault-relative folder path (may be empty, meaning "place directly in the base folder"). */
	path: string;
	/** True when `path` differs from the value the user entered. */
	wasChanged: boolean;
	/** First reason found, or `null` when nothing needed changing. */
	reason: InkSubfolderPathChangeReason | null;
}

/**
 * Cleans a user-entered Ink subfolder path so vault folder creation cannot fail silently.
 * Obsidian rejects folder names that start with a dot (#64: `.ink/Writing` saved nothing and
 * gave no feedback), and `/` duplication or `..` produced empty or escaping paths. We repair
 * these instead of rejecting them so the section is still created where the user meant.
 */
export function sanitiseInkSubfolderPath(enteredPath: string): InkSubfolderSanitisationResult {
	const trimmed = (enteredPath ?? '').trim();
	if (trimmed.length === 0) {
		return { path: '', wasChanged: false, reason: null };
	}

	let reason: InkSubfolderPathChangeReason | null = null;

	let withForwardSlashes = trimmed;
	if (trimmed.includes('\\')) {
		withForwardSlashes = trimmed.replace(/\\/g, '/');
		reason = 'backslash';
	}

	const inputSegments = withForwardSlashes.split('/');
	const outputSegments: string[] = [];

	for (const rawSegment of inputSegments) {
		const segment = rawSegment.trim();
		// Empty and current-directory segments carry no meaning; drop them.
		if (segment.length === 0 || segment === '.') continue;

		// A `..` segment would let the file escape the attachment base folder.
		if (segment === '..') {
			if (reason === null) reason = 'parent-traversal';
			continue;
		}

		// Obsidian refuses to create dotted folder names, so strip any leading dots.
		const withoutLeadingDots = segment.replace(/^\.+/, '');
		if (withoutLeadingDots !== segment && reason === null) {
			reason = 'leading-dot-segment';
		}
		if (withoutLeadingDots.length === 0) continue;

		outputSegments.push(withoutLeadingDots);
	}

	const sanitised = outputSegments.join('/');
	if (reason === null && sanitised !== trimmed) reason = 'extra-slash';

	return {
		path: sanitised,
		wasChanged: sanitised !== enteredPath,
		reason,
	};
}

/**
 * Human-readable explanation used in the settings notice when a path had to be repaired.
 * Returns `null` when there is nothing worth telling the user.
 */
export function describeInkSubfolderPathChange(
	result: InkSubfolderSanitisationResult,
): string | null {
	if (!result.wasChanged) return null;

	if (result.reason === 'leading-dot-segment') {
		return 'Obsidian cannot create folders whose names start with a dot, so those dots were removed.';
	}
	if (result.reason === 'parent-traversal') {
		return 'Ink files cannot be saved outside the vault, so ".." was removed.';
	}
	if (result.reason === 'backslash') {
		return 'Backslashes were converted to forward slashes for the folder path.';
	}
	if (result.reason === 'extra-slash') {
		return 'Repeated or trailing slashes were removed from the folder path.';
	}

	return 'The folder path was adjusted so Ink can create the folder.';
}
