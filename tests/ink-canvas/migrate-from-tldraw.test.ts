import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, test } from '@jest/globals';
import {
	migrateFromTldraw,
	migrateWritingFromTldraw,
	type TldrawSnapshotForMigration,
} from 'src/ink-canvas/migrate-from-tldraw';
import {
	MOUSE_NUMERIC_STROKE_PARTIAL,
	PEN_NUMERIC_STROKE_PARTIAL,
} from 'src/ink-canvas/stroke-presets';
import { renderStrokesToSvg } from 'src/ink-canvas/svg-export';
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

function expectMouseStrokePreset(stroke: InkStroke): void {
	expect(stroke.style.inputKind).toBe('mouse');
	expect(stroke.style.thinning).toBe(MOUSE_NUMERIC_STROKE_PARTIAL.thinning);
	expect(stroke.style.smoothing).toBe(MOUSE_NUMERIC_STROKE_PARTIAL.smoothing);
	expect(stroke.style.streamline).toBe(MOUSE_NUMERIC_STROKE_PARTIAL.streamline);
	expect(stroke.style.simulatePressure).toBe(MOUSE_NUMERIC_STROKE_PARTIAL.simulatePressure);
}

function expectPenStrokePreset(stroke: InkStroke): void {
	expect(stroke.style.inputKind).toBe('pen');
	expect(stroke.style.thinning).toBe(PEN_NUMERIC_STROKE_PARTIAL.thinning);
	expect(stroke.style.smoothing).toBe(PEN_NUMERIC_STROKE_PARTIAL.smoothing);
	expect(stroke.style.streamline).toBe(PEN_NUMERIC_STROKE_PARTIAL.streamline);
	expect(stroke.style.simulatePressure).toBe(PEN_NUMERIC_STROKE_PARTIAL.simulatePressure);
}

describe('migrate-from-tldraw stroke styles', () => {
	test('legacy writing fixture uses currentColor and mouse presets', () => {
		const legacy = JSON.parse(fs.readFileSync(LEGACY_WRITING_FIXTURE, 'utf8')) as {
			tldraw: TldrawSnapshotForMigration;
		};
		const migrated = migrateWritingFromTldraw(legacy.tldraw);
		expectAllStrokesUseThemeColor(migrated.strokes);
		expectMouseStrokePreset(migrated.strokes[0]);
	});

	test('legacy drawing fixture uses currentColor and mouse presets', () => {
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
		expectMouseStrokePreset(migrated.strokes[0]);
	});

	test('exported SVG uses currentColor fill not baked dark hex', () => {
		const legacy = JSON.parse(fs.readFileSync(LEGACY_WRITING_FIXTURE, 'utf8')) as {
			tldraw: TldrawSnapshotForMigration;
		};
		const migrated = migrateFromTldraw(legacy.tldraw);
		const svgString = renderStrokesToSvg(migrated.strokes, migrated);
		expect(svgString).toContain('fill="currentColor"');
		expect(svgString).not.toContain('fill="#1d1d1d"');
	});

	test('pen shapes get pen numeric preset', () => {
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
		expectPenStrokePreset(migrated.strokes[0]);
		expect(migrated.strokes[0].style.color).toBe('currentColor');
	});
});
