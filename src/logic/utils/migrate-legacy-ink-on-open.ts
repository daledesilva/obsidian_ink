import { Notice, TFile } from 'obsidian';
import InkPlugin from 'src/main';
import { refreshLivePreviewEmbedsWhenReady } from 'src/components/formats/current/ink-embeds-extension/ink-embed-refresh';
import { openInkFileInView } from 'src/logic/utils/open-file';
import {
	buildSingleLegacyFileScanResult,
	executeMigration,
	getLegacyInkFileType,
	getLegacySvgPath,
	isLegacyInkFilePath,
} from 'src/logic/utils/migration-logic';
import {
	buildSingleTldrawSvgScanResult,
	executeTldrawSvgMigration,
} from 'src/logic/utils/tldraw-svg-migration-logic';

export type LegacyInkMigrationOnOpenResult = {
	openedFile: TFile;
	viewType: 'inkWriting' | 'inkDrawing';
};

function resolveVaultLinkPath(
	plugin: InkPlugin,
	linkpath: string,
	sourceNotePath: string,
): string | null {
	return plugin.app.metadataCache.getFirstLinkpathDest(linkpath, sourceNotePath)?.path ?? null;
}

/**
 * Permanently migrates one legacy ink attachment opened from the editor notice.
 * Handles v1 `.writing` / `.drawing` files and v2 SVG files that still store tldraw metadata.
 */
export async function migrateLegacyInkFileOnOpen(
	plugin: InkPlugin,
	legacyFile: TFile,
): Promise<LegacyInkMigrationOnOpenResult> {
	const vault = plugin.app.vault;

	if (isLegacyInkFilePath(legacyFile.path)) {
		const scanResult = await buildSingleLegacyFileScanResult(vault, legacyFile);
		if (!scanResult) {
			throw new Error('Could not prepare migration for this legacy file.');
		}

		const migrationResult = await executeMigration(
			vault,
			plugin.app.fileManager,
			scanResult,
			undefined,
			{
				singleLegacyFilePath: legacyFile.path,
			},
		);

		if (migrationResult.convertedFiles === 0) {
			const detail = migrationResult.failed[0] ?? migrationResult.skipped[0] ?? 'unknown error';
			throw new Error(detail);
		}

		const fileType = getLegacyInkFileType(legacyFile.path);
		if (!fileType) {
			throw new Error('Could not determine legacy file type.');
		}

		const newSvgPath = getLegacySvgPath(legacyFile.path);
		const openedFile = vault.getFileByPath(newSvgPath);
		if (!openedFile) {
			throw new Error('Migration completed but the new SVG file was not found.');
		}

		refreshLivePreviewEmbedsWhenReady(plugin);

		return {
			openedFile,
			viewType: fileType === 'drawing' ? 'inkDrawing' : 'inkWriting',
		};
	}

	const tldrawScanResult = await buildSingleTldrawSvgScanResult(
		vault,
		legacyFile,
		(linkpath, sourceNotePath) => resolveVaultLinkPath(plugin, linkpath, sourceNotePath),
	);
	if (!tldrawScanResult) {
		throw new Error('This file is not eligible for on-open migration.');
	}

	const tldrawMigrationResult = await executeTldrawSvgMigration(vault, tldrawScanResult);
	if (tldrawMigrationResult.convertedFiles === 0) {
		const detail = tldrawMigrationResult.failed[0] ?? tldrawMigrationResult.skipped[0] ?? 'unknown error';
		throw new Error(detail);
	}

	const entry = tldrawScanResult.tldrawSvgFiles[0];
	refreshLivePreviewEmbedsWhenReady(plugin);

	return {
		openedFile: entry.svgFile,
		viewType: entry.fileKind === 'drawing' ? 'inkDrawing' : 'inkWriting',
	};
}

export async function runLegacyInkMigrationFromNotice(
	plugin: InkPlugin,
	legacyFile: TFile,
	options?: { isEmbedded?: boolean },
): Promise<void> {
	const migrationResult = await migrateLegacyInkFileOnOpen(plugin, legacyFile);
	new Notice('Migrated to the new SVG format.');
	// Embeds already get a Live Preview rebuild from migrateLegacyInkFileOnOpen; opening a
	// dedicated ink leaf would steal the active markdown note. Only reopen when migration
	// started from a dedicated writing/drawing view (e.g. .writing → new .svg path).
	if (options?.isEmbedded) return;
	await openInkFileInView(migrationResult.openedFile, migrationResult.viewType);
}
