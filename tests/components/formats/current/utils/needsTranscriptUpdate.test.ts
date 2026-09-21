import { describe, expect, test, jest } from '@jest/globals';
import { TFile } from 'obsidian';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';
import {
	needsTranscriptUpdate,
	saveWriteFileTranscript,
} from 'src/components/formats/current/utils/needsTranscriptUpdate';
import { InkFileData } from 'src/components/formats/current/types/file-data';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';

const TLDRAW_JSON = JSON.stringify({
	document: { store: {}, schema: { schemaVersion: 2, sequences: {} } },
	session: {},
});

function makeWritingSvg(transcript?: string): string {
	const transcriptElement = transcript
		? `<transcript>${transcript}</transcript>`
		: '';
	return `<svg xmlns="http://www.w3.org/2000/svg">
<metadata>
<ink plugin-version="${PLUGIN_VERSION}" file-type="inkWriting"/>
${transcriptElement}
<tldraw version="${TLDRAW_VERSION}">${TLDRAW_JSON}</tldraw>
</metadata>
</svg>`;
}

function makePageData(): InkFileData {
	return {
		meta: {
			pluginVersion: PLUGIN_VERSION,
			tldrawVersion: TLDRAW_VERSION,
			fileType: 'inkWriting',
		},
		tldraw: JSON.parse(TLDRAW_JSON),
		svgString: makeWritingSvg(),
	};
}

function makePlugin(initialSvg: string, mtime = 1_700_000_000_000) {
	const fileRef = {
		path: 'Ink/Writing/test.svg',
		stat: { mtime },
	} as TFile;
	let storedContent = initialSvg;

	const vault = {
		read: jest.fn(async () => storedContent),
		modify: jest.fn(async (_file: TFile, content: string) => {
			storedContent = content;
		}),
	};

	return {
		plugin: { app: { vault } } as any,
		fileRef,
		getStoredContent: () => storedContent,
		vault,
	};
}

describe('needsTranscriptUpdate', () => {
	test('returns false while auto-transcribe is disabled', () => {
		expect(needsTranscriptUpdate(makePageData())).toBe(false);
	});
});

describe('saveWriteFileTranscript', () => {
	test('writes transcript element to SVG and preserves file mtime', async () => {
		const initialSvg = makeWritingSvg();
		const { plugin, fileRef, getStoredContent, vault } = makePlugin(initialSvg);
		const mtime = fileRef.stat.mtime;

		await saveWriteFileTranscript(plugin, fileRef, 'saved transcript');

		expect(vault.read).toHaveBeenCalledWith(fileRef);
		expect(vault.modify).toHaveBeenCalledWith(
			fileRef,
			expect.stringContaining('<transcript>saved transcript</transcript>'),
			{ mtime },
		);
		expect(extractInkJsonFromSvg(getStoredContent())?.meta.transcript).toBe('saved transcript');
		expect(getStoredContent()).not.toContain('bbox-cells-at-last-transcription');
		expect(getStoredContent()).not.toContain('last-transcription-at');
	});

	test('writes bbox occupancy snapshot only when fingerprint fields are passed', async () => {
		const initialSvg = makeWritingSvg();
		const { plugin, fileRef, getStoredContent } = makePlugin(initialSvg);

		await saveWriteFileTranscript(plugin, fileRef, 'saved transcript', {
			lastTranscriptionAt: '2026-09-21T13:00:00.000Z',
		});

		expect(getStoredContent()).toContain('last-transcription-at="2026-09-21T13:00:00.000Z"');
		expect(extractInkJsonFromSvg(getStoredContent())?.meta.lastTranscriptionAt).toBe(
			'2026-09-21T13:00:00.000Z',
		);
	});

	test('does nothing when SVG metadata cannot be parsed', async () => {
		const { plugin, fileRef, vault } = makePlugin('not svg');
		await saveWriteFileTranscript(plugin, fileRef, 'ignored');
		expect(vault.modify).not.toHaveBeenCalled();
	});
});
