import { describe, expect, test } from '@jest/globals';
import { StrokeStore, type StrokeStoreChange } from 'src/ink-canvas/stroke-store';
import type { InkStroke } from 'src/ink-canvas/types';
import { DEFAULT_STROKE_STYLE } from 'src/ink-canvas/types';

function makeStroke(id: string): InkStroke {
	return {
		id,
		points: [[0, 0, 0.5], [10, 10, 0.5]],
		style: { ...DEFAULT_STROKE_STYLE },
		offset: { x: 0, y: 0 },
	};
}

describe('StrokeStore change notifications', () => {
	test('identifies only the strokes touched by incremental mutations', () => {
		const store = new StrokeStore();
		const changes: StrokeStoreChange[] = [];
		store.subscribe((change) => changes.push(change));

		store.add(makeStroke('a'));
		store.addMany([makeStroke('b'), makeStroke('c')]);
		store.updateOffsets(new Map([['b', { x: 5, y: 8 }]]));
		store.remove(['a']);

		expect(changes).toEqual([
			{ type: 'add', ids: ['a'] },
			{ type: 'addMany', ids: ['b', 'c'] },
			{ type: 'updateOffsets', ids: ['b'] },
			{ type: 'remove', ids: ['a'] },
		]);
	});

	test('marks whole-store replacement mutations explicitly', () => {
		const store = new StrokeStore();
		const changes: StrokeStoreChange[] = [];
		store.subscribe((change) => changes.push(change));

		store.replaceAll([makeStroke('a')]);
		store.clear();

		expect(changes).toEqual([
			{ type: 'replaceAll', ids: [] },
			{ type: 'clear', ids: [] },
		]);
	});
});
