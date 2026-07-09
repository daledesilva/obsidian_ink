#!/usr/bin/env node
/**
 * Export migrated SVG path previews from legacy .writing / .drawing fixtures.
 *
 * Usage (from obsidian_ink/):
 *   npx tsx scripts/compare-legacy-migration-svg.ts
 *   npx tsx scripts/compare-legacy-migration-svg.ts qa-test-vault/fixtures/captured-legacy-writing-2024-07-22-2152.writing
 *
 * Writes under qa-test-vault/_migration-compare/:
 *   <basename>.migrated.svg
 *
 * Compare workflow:
 * 1. Open a legacy embed in QA vault section 18 BEFORE migration (tldraw preview).
 * 2. Open the matching .migrated.svg side-by-side at the same zoom.
 * 3. Re-run this script after changing migrate-from-tldraw.ts.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WRITING_LINE_HEIGHT, WRITING_PAGE_WIDTH } from '../src/constants';
import {
	migrateFromTldraw,
	migrateWritingFromTldraw,
	type TldrawSnapshotForMigration,
} from '../src/ink-canvas/migrate-from-tldraw';
import { renderStrokesToSvg, renderWritingStrokesToSvg } from '../src/ink-canvas/svg-export';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(ROOT, 'qa-test-vault/fixtures');
const OUTPUT_DIR = path.join(ROOT, 'qa-test-vault/_migration-compare');

const DEFAULT_FIXTURES = [
	'legacy-writing-fixture.writing',
	'legacy-drawing-fixture.drawing',
	'captured-legacy-writing-2024-07-22-2152.writing',
	'captured-legacy-writing-2024-08-06-2302.writing',
	'captured-legacy-drawing-2025-03-16-1330.drawing',
];

function convertLegacyJsonToSvg(legacyJson: string, fileType: 'writing' | 'drawing'): string | null {
	const legacyData = JSON.parse(legacyJson) as { tldraw?: TldrawSnapshotForMigration };
	if (!legacyData.tldraw) return null;

	if (fileType === 'writing') {
		const inkCanvasSnapshot = migrateWritingFromTldraw(legacyData.tldraw, WRITING_LINE_HEIGHT);
		return renderWritingStrokesToSvg(
			inkCanvasSnapshot.strokes,
			inkCanvasSnapshot,
			WRITING_PAGE_WIDTH,
		);
	}

	const inkCanvasSnapshot = migrateFromTldraw(legacyData.tldraw);
	return renderStrokesToSvg(inkCanvasSnapshot.strokes, inkCanvasSnapshot);
}

function fileTypeFor(fixturePath: string): 'writing' | 'drawing' {
	return fixturePath.endsWith('.writing') ? 'writing' : 'drawing';
}

function exportFixture(fixturePath: string) {
	const fileType = fileTypeFor(fixturePath);
	const legacyJson = fs.readFileSync(fixturePath, 'utf8');
	const svg = convertLegacyJsonToSvg(legacyJson, fileType);
	if (!svg) {
		console.warn('Skip (parse failed):', fixturePath);
		return;
	}
	const basename = path.basename(fixturePath).replace(/\.(writing|drawing)$/, '');
	const outPath = path.join(OUTPUT_DIR, `${basename}.migrated.svg`);
	fs.writeFileSync(outPath, svg, 'utf8');
	console.log(`Wrote ${path.relative(ROOT, outPath)}`);
}

const inputs = process.argv.slice(2);
const fixturePaths = (inputs.length ? inputs : DEFAULT_FIXTURES).map((p) =>
	path.isAbsolute(p) ? p : path.join(inputs.length ? ROOT : FIXTURES_DIR, p),
);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
for (const fixturePath of fixturePaths) {
	if (!fs.existsSync(fixturePath)) {
		console.warn('Missing:', fixturePath);
		continue;
	}
	exportFixture(fixturePath);
}
console.log(`\nCompare folder: ${OUTPUT_DIR}`);
