import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, test } from '@jest/globals';
import {
	buildTldrawMigrationStrokeStyle,
	migrateFromTldraw,
	migrateWritingFromTldraw,
	type TldrawSnapshotForMigration,
} from 'src/ink-canvas/migrate-from-tldraw';
import { renderStrokesToSvg } from 'src/ink-canvas/svg-export';
import { DEFAULT_STROKE_STYLE } from 'src/ink-canvas/types';
import type { InkStroke } from 'src/ink-canvas/types';

const LEGACY_WRITING_FIXTURE = path.join(
	__dirname,
	'../../qa-test-vault/fixtures/legacy-writing-fixture.writing',
);

function expectAllStrokesUseThemeColor(strokes: InkStroke[]): void {
	expect(strokes.length).toBeGreaterThan(0);
	for (const stroke of strokes) {
		expect(stroke.style.color).toBe('currentColor');
	}
}

function expectTldrawMigrationStrokePreset(stroke: InkStroke, isPen: boolean): void {
	expect(stroke.style.inputKind).toBe(isPen ? 'pen' : 'mouse');
	expect(stroke.style.thinning).toBe(DEFAULT_STROKE_STYLE.thinning);
	expect(stroke.style.smoothing).toBe(DEFAULT_STROKE_STYLE.smoothing);
	expect(stroke.style.streamline).toBe(DEFAULT_STROKE_STYLE.streamline);
	expect(stroke.style.simulatePressure).toBe(!isPen);
}

describe('migrate-from-tldraw stroke styles', () => {
	test('legacy writing fixture uses tldraw migration smoothing (not live pen preset)', () => {
		const legacy = JSON.parse(fs.readFileSync(LEGACY_WRITING_FIXTURE, 'utf8')) as {
			tldraw: TldrawSnapshotForMigration;
		};
		const migrated = migrateWritingFromTldraw(legacy.tldraw);
		expectAllStrokesUseThemeColor(migrated.strokes);
		expectTldrawMigrationStrokePreset(migrated.strokes[0], false);
	});

	test('legacy drawing fixture uses tldraw migration smoothing', () => {
		const legacyDrawingFixture = path.join(
			__dirname,
			'../../qa-test-vault/fixtures/legacy-drawing-fixture.drawing',
		);
		const legacy = JSON.parse(fs.readFileSync(legacyDrawingFixture, 'utf8')) as {
			tldraw: TldrawSnapshotForMigration;
		};
		const migrated = migrateFromTldraw(legacy.tldraw);
		expect(migrated.camera).toBeUndefined();
		expectAllStrokesUseThemeColor(migrated.strokes);
		expectTldrawMigrationStrokePreset(migrated.strokes[0], false);
	});

	test('exported SVG uses baked primary stroke fill and classes', () => {
		const legacy = JSON.parse(fs.readFileSync(LEGACY_WRITING_FIXTURE, 'utf8')) as {
			tldraw: TldrawSnapshotForMigration;
		};
		const migrated = migrateFromTldraw(legacy.tldraw);
		const svgString = renderStrokesToSvg(migrated.strokes, migrated);
		expect(svgString).toContain('fill="#000000"');
		expect(svgString).toContain('class="ink-type-stroke ink-color-primary"');
		expect(svgString).not.toContain('fill="currentColor"');
	});

	test('pen shapes keep migration smoothing with simulatePressure off', () => {
		const snapshot: TldrawSnapshotForMigration = {
			store: {
				'shape:pen': {
					typeName: 'shape',
					type: 'draw',
					id: 'shape:pen',
					x: 0,
					y: 0,
					props: {
						color: 'black',
						size: 'm',
						isPen: true,
						isComplete: true,
						segments: [
							{
								type: 'free',
								points: [
									{ x: 0, y: 0, z: 0.5 },
									{ x: 10, y: 10, z: 0.6 },
								],
							},
						],
					},
				},
			},
		};
		const migrated = migrateFromTldraw(snapshot);
		expect(migrated.strokes).toHaveLength(1);
		expectTldrawMigrationStrokePreset(migrated.strokes[0], true);
		expect(migrated.strokes[0].style.color).toBe('currentColor');
	});

	test('buildTldrawMigrationStrokeStyle maps medium size to tldraw effective width', () => {
		const style = buildTldrawMigrationStrokeStyle(
			{
				color: 'black',
				size: 'm',
				isPen: true,
				isComplete: true,
				segments: [],
			},
			6.25,
		);
		expect(style.size).toBe(6.25);
		expect(style.streamline).toBe(0.5);
	});
});
