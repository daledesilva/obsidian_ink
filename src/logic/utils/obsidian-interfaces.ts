import InkPlugin from "src/main";
import { resolveObsidianAttachmentFolderPath } from "./obsidian-attachment-folder";
import { debug } from "./universal-dev-logging";

////////////
////////////

/**
 * Vault exposes `getConfig` at runtime but it is absent from the public Obsidian typings.
 * Reading a config key this way has no vault side effects, unlike `getAvailablePathForAttachment`.
 */
interface VaultWithConfigReading {
	getConfig?: (key: string) => unknown;
}

/**
 * Vault-relative folder Obsidian uses for attachments, or `null` for the vault root.
 *
 * Why this exists: the previous implementation called `fileManager.getAvailablePathForAttachment()`
 * to discover the folder, but that API also creates the folder. Ink only needed to read the
 * setting, so it left an empty `attachments/` folder behind for users with a custom Ink folder
 * (#126). Reading `attachmentFolderPath` directly keeps the same answer without touching the vault.
 */
export async function getObsidianAttachmentFolderPath(
	plugin: InkPlugin,
	sourceNotePath?: string | null,
): Promise<string | null> {
	const vaultWithConfig = plugin.app.vault as unknown as VaultWithConfigReading;
	if (typeof vaultWithConfig.getConfig !== 'function') return null;

	let storedSetting: string | null = null;
	try {
		const rawSetting = vaultWithConfig.getConfig('attachmentFolderPath');
		storedSetting = typeof rawSetting === 'string' ? rawSetting : null;
	} catch {
		// Treat an unreadable setting as the vault root.
		return null;
	}

    return resolveObsidianAttachmentFolderPath(storedSetting, sourceNotePath ?? null);
}

/**
 * Reports the resolved attachment folder at debug level.
 * Issue #126 was invisible because nothing recorded which base path was chosen.
 */
export function logResolvedAttachmentFolder(
	basePath: string,
	obsAttachmentFolderPath: string | null,
): void {
	debug([
		'Ink attachment base path',
		basePath.length > 0 ? basePath : '(vault root)',
		`obsidianFolder=${obsAttachmentFolderPath ?? '(vault root)'}`,
	]);
}
