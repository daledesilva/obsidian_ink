import { TFile } from 'obsidian';
import { migrateLegacyInkFileOnOpen } from 'src/logic/utils/migrate-legacy-ink-on-open';
import {
	buildSingleLegacyFileScanResult,
	executeMigration,
	getLegacySvgPath,
} from 'src/logic/utils/migration-logic';
import {
	buildSingleTldrawSvgScanResult,
	executeTldrawSvgMigration,
} from 'src/logic/utils/tldraw-svg-migration-logic';

jest.mock('src/logic/utils/migration-logic', () => ({
	...jest.requireActual('src/logic/utils/migration-logic'),
	buildSingleLegacyFileScanResult: jest.fn(),
	executeMigration: jest.fn(),
}));

jest.mock('src/logic/utils/tldraw-svg-migration-logic', () => ({
	...jest.requireActual('src/logic/utils/tldraw-svg-migration-logic'),
	buildSingleTldrawSvgScanResult: jest.fn(),
	executeTldrawSvgMigration: jest.fn(),
}));

jest.mock('src/components/formats/current/ink-embeds-extension/ink-embed-refresh', () => ({
	refreshLivePreviewEmbedsWhenReady: jest.fn(),
}));

function makePlugin(vault: Record<string, unknown>) {
	return {
		app: {
			vault,
			fileManager: {
				trashFile: jest.fn(),
			},
			metadataCache: {
				getFirstLinkpathDest: jest.fn(),
			},
		},
	} as any;
}

describe('migrateLegacyInkFileOnOpen', () => {
	const legacyWritingFile = { path: 'Ink/Writing/note.writing', extension: 'writing' } as TFile;
	const legacySvgFile = { path: 'Ink/Writing/note.svg', extension: 'svg' } as TFile;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	test('migrates a legacy .writing file to its .svg path', async () => {
		const openedFile = { path: getLegacySvgPath(legacyWritingFile.path) } as TFile;
		const vault = {
			getFileByPath: jest.fn(() => openedFile),
		};
		const plugin = makePlugin(vault);

		(buildSingleLegacyFileScanResult as jest.Mock).mockResolvedValueOnce({
			legacyFiles: [],
			affectedNotes: [],
		});
		(executeMigration as jest.Mock).mockResolvedValueOnce({ convertedFiles: 1, failed: [], skipped: [] });

		const result = await migrateLegacyInkFileOnOpen(plugin, legacyWritingFile);

		expect(executeMigration).toHaveBeenCalledWith(
			vault,
			plugin.app.fileManager,
			expect.any(Object),
			undefined,
			{ singleLegacyFilePath: legacyWritingFile.path },
		);
		expect(result.openedFile).toBe(openedFile);
		expect(result.viewType).toBe('inkWriting');
	});

	test('migrates a tldraw SVG file in place', async () => {
		const plugin = makePlugin({});
		const scanResult = {
			tldrawSvgFiles: [{
				svgFile: legacySvgFile,
				fileKind: 'writing' as const,
				newSvgPath: legacySvgFile.path,
				referencingNotes: [],
			}],
			affectedNotes: [],
		};

		(buildSingleTldrawSvgScanResult as jest.Mock).mockResolvedValueOnce(scanResult);
		(executeTldrawSvgMigration as jest.Mock).mockResolvedValueOnce({
			convertedFiles: 1,
			failed: [],
			skipped: [],
		});

		const result = await migrateLegacyInkFileOnOpen(plugin, legacySvgFile);

		expect(executeTldrawSvgMigration).toHaveBeenCalledWith(plugin.app.vault, scanResult);
		expect(result.openedFile).toBe(legacySvgFile);
		expect(result.viewType).toBe('inkWriting');
	});
});
