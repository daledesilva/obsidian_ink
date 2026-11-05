import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { buildFileStr } from 'src/components/formats/current/utils/buildFileStr';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';
import type { InkCanvasSnapshot } from 'src/ink-canvas/types';
import type { InkFileData } from 'src/components/formats/current/types/file-data';
import { enqueueManualTranscription } from 'src/logic/handwriting-transcription-queue';
import { planTranscriptionBatch, runTranscriptionBatch } from 'src/logic/transcription-batch';

jest.mock('src/logic/handwriting-transcription-queue', () => ({
	enqueueManualTranscription: jest.fn(async () => {}),
}));

const enqueue = jest.mocked(enqueueManualTranscription);

const minimalSnapshot = {
	document: { store: {}, schema: { schemaVersion: 2, sequences: {} } },
	session: {},
} as InkFileData['tldraw'];

function inkFile(fileType: 'inkWriting' | 'inkDrawing', transcript?: string): string {
	const inkCanvas: InkCanvasSnapshot = {
		version: 1,
		strokes: [],
		gridEnabled: false,
		writingLineHeight: 150,
	};
	const pageData: InkFileData = {
		meta: {
			pluginVersion: PLUGIN_VERSION,
			tldrawVersion: TLDRAW_VERSION,
			fileType,
			transcript,
		},
		tldraw: minimalSnapshot,
		inkCanvas,
		svgString: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
	};
	return buildFileStr(pageData);
}

function pluginWithVault(entries: { path: string; extension: string; content: string }[]) {
	return {
		app: {
			vault: {
				getFiles: () => entries.map((entry) => ({ path: entry.path, extension: entry.extension })),
				cachedRead: async (file: { path: string }) => {
					const entry = entries.find((candidate) => candidate.path === file.path);
					if (!entry) throw new Error(`missing ${file.path}`);
					if (entry.content === 'THROW') throw new Error('unreadable');
					return entry.content;
				},
			},
		},
	} as any;
}

describe('planTranscriptionBatch', () => {
	const writingMissing = inkFile('inkWriting');
	const writingDone = inkFile('inkWriting', 'already read');
	const writingBlankTranscript = inkFile('inkWriting', '   ');
	const drawing = inkFile('inkDrawing', 'a sketch');

	function vault() {
		return pluginWithVault([
			{ path: 'notes/b-writing.svg', extension: 'svg', content: writingDone },
			{ path: 'notes/a-writing.svg', extension: 'svg', content: writingMissing },
			{ path: 'notes/blank-transcript.svg', extension: 'svg', content: writingBlankTranscript },
			{ path: 'notes/drawing.svg', extension: 'svg', content: drawing },
			{ path: 'notes/plain.svg', extension: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
			{ path: 'notes/broken.svg', extension: 'svg', content: 'THROW' },
			{ path: 'notes/page.md', extension: 'md', content: 'not ink' },
		]);
	}

	test('missing-only queues writing without a transcript and counts the rest', async () => {
		const plan = await planTranscriptionBatch(vault(), 'inkWriting', 'missing-only');
		expect(plan.candidates.map((candidate) => candidate.file.path)).toEqual([
			'notes/a-writing.svg',
			'notes/blank-transcript.svg',
		]);
		expect(plan.alreadyTranscribedCount).toBe(1);
		expect(plan.candidates[0].svgFileContent).toBe(writingMissing);
	});

	test('everything includes writing that already has a transcript', async () => {
		const plan = await planTranscriptionBatch(vault(), 'inkWriting', 'everything');
		expect(plan.candidates.map((candidate) => candidate.file.path)).toEqual([
			'notes/a-writing.svg',
			'notes/b-writing.svg',
			'notes/blank-transcript.svg',
		]);
		expect(plan.alreadyTranscribedCount).toBe(0);
	});

	test('a drawing run does not include writing', async () => {
		const plan = await planTranscriptionBatch(vault(), 'inkDrawing', 'everything');
		expect(plan.candidates.map((candidate) => candidate.file.path)).toEqual(['notes/drawing.svg']);
	});
});

describe('runTranscriptionBatch', () => {
	beforeEach(() => {
		enqueue.mockClear();
	});

	test('enqueues in path order and reports progress from the svg already read', async () => {
		const plugin = pluginWithVault([
			{ path: 'z.svg', extension: 'svg', content: inkFile('inkWriting', 'done') },
			{ path: 'a.svg', extension: 'svg', content: inkFile('inkWriting') },
		]);
		const progress: string[] = [];
		const result = await runTranscriptionBatch(plugin, {
			fileType: 'inkWriting',
			scope: 'everything',
			onProgress: (queuedCount, totalCount) => {
				progress.push(`${queuedCount}/${totalCount}`);
			},
		});

		expect(result).toEqual({ queuedCount: 2, alreadyTranscribedCount: 0 });
		expect(progress).toEqual(['1/2', '2/2']);
		expect(enqueue).toHaveBeenCalledTimes(2);
		expect(enqueue.mock.calls[0][0].file.path).toBe('a.svg');
		expect(enqueue.mock.calls[1][0].file.path).toBe('z.svg');
		expect(enqueue.mock.calls[0][0].fileType).toBe('inkWriting');
		expect(enqueue.mock.calls[0][0].svgFileContent).toContain('file-type="inkWriting"');
	});
});
