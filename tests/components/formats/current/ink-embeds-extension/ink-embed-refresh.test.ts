import type InkPlugin from 'src/main';
import { editorLivePreviewField } from 'obsidian';
import { refreshLivePreviewEmbedsWhenReady } from 'src/components/formats/current/ink-embeds-extension/ink-embed-refresh';
import { refreshDrawingEmbedsNow } from 'src/components/formats/current/drawing/drawing-embed-extension/drawing-embed-extension';
import { refreshWritingEmbedsNow } from 'src/components/formats/current/writing/writing-embed-extension/writing-embed-extension';
import { clearAllInkCmScrollerScrollLocks } from 'src/components/jsx-components/finger-blocker/finger-blocker';

jest.mock('src/components/formats/current/drawing/drawing-embed-extension/drawing-embed-extension', () => ({
	refreshDrawingEmbedsNow: jest.fn(),
}));
jest.mock('src/components/formats/current/writing/writing-embed-extension/writing-embed-extension', () => ({
	refreshWritingEmbedsNow: jest.fn(),
}));
jest.mock('src/components/jsx-components/finger-blocker/finger-blocker', () => ({
	clearAllInkCmScrollerScrollLocks: jest.fn(),
}));

// LIVE_PREVIEW_EMBED_REFRESH_MAX_ATTEMPTS in ink-embed-refresh.ts.
const MAX_ATTEMPTS = 24;

/**
 * Mirrors @codemirror/state EditorState.field semantics: throws RangeError for
 * a missing field unless `false` is passed as the second argument to request the
 * non-throwing read. During workspace restore, the CM state can exist without
 * Obsidian's standard extensions, so editorLivePreviewField can be absent.
 */
class FakeCmState {
	constructor(private readonly values: Map<unknown, unknown>) {}

	field(field: unknown, require: boolean = true): unknown {
		if (this.values.has(field)) return this.values.get(field);
		if (require === false) return undefined;
		throw new RangeError('Field is not present in this state');
	}
}

interface FakeMarkdownView {
	getMode: () => string;
	editor: { cm: { state: FakeCmState } };
}

const makeMarkdownView = (cmState: FakeCmState): FakeMarkdownView => ({
	getMode: () => 'source',
	editor: { cm: { state: cmState } },
});

const makePlugin = (activeView: FakeMarkdownView | null): InkPlugin =>
	({
		app: { workspace: { getActiveViewOfType: () => activeView } },
	}) as unknown as InkPlugin;

let scheduledFrames: FrameRequestCallback[] = [];
let requestAnimationFrameSpy: jest.SpyInstance;

beforeEach(() => {
	scheduledFrames = [];
	requestAnimationFrameSpy = jest
		.spyOn(window, 'requestAnimationFrame')
		.mockImplementation((callback: FrameRequestCallback) => {
			scheduledFrames.push(callback);
			return scheduledFrames.length;
		});
});

afterEach(() => {
	requestAnimationFrameSpy.mockRestore();
});

/**
 * refreshLivePreviewEmbedsWhenReady queues its first frame in a microtask; this
 * flushes it (the production microtask was queued before ours).
 */
const flushInitialMicrotask = () =>
	new Promise<void>((resolve) => {
		queueMicrotask(resolve);
	});

/** Runs every scheduled frame (and any frame they schedule) until the poll stops. */
const drainScheduledFrames = (): number => {
	let invokedFrames = 0;
	while (scheduledFrames.length > 0) {
		const frame = scheduledFrames.shift();
		if (!frame) break;
		frame(0);
		invokedFrames += 1;
	}
	return invokedFrames;
};

describe('refreshLivePreviewEmbedsWhenReady', () => {
	it('keeps polling without throwing while editorLivePreviewField is absent from the CM state', async () => {
		// Regression: during workspace restore the active markdown editor's CM
		// state can exist without Obsidian's standard extensions; an unguarded
		// field() read threw an uncaught RangeError that aborted the restore
		// (Obsidian discarded the workspace's markdown tabs).
		const stateMissingLivePreviewField = new FakeCmState(new Map());
		refreshLivePreviewEmbedsWhenReady(
			makePlugin(makeMarkdownView(stateMissingLivePreviewField)),
		);
		await flushInitialMicrotask();
		expect(scheduledFrames).toHaveLength(1);

		let drainedFrames = 0;
		expect(() => {
			drainedFrames = drainScheduledFrames();
		}).not.toThrow();

		// The poll exhausts its attempts instead of spinning forever, and never
		// force-rebuilds embeds while live preview is unavailable.
		expect(drainedFrames).toBe(MAX_ATTEMPTS);
		expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(MAX_ATTEMPTS);
		expect(refreshDrawingEmbedsNow).not.toHaveBeenCalled();
		expect(refreshWritingEmbedsNow).not.toHaveBeenCalled();
		expect(clearAllInkCmScrollerScrollLocks).not.toHaveBeenCalled();
	});

	it('keeps polling while the CM state reports live preview disabled', async () => {
		const sourceModeState = new FakeCmState(new Map([[editorLivePreviewField, false]]));
		refreshLivePreviewEmbedsWhenReady(makePlugin(makeMarkdownView(sourceModeState)));
		await flushInitialMicrotask();

		const drainedFrames = drainScheduledFrames();

		expect(drainedFrames).toBe(MAX_ATTEMPTS);
		expect(refreshDrawingEmbedsNow).not.toHaveBeenCalled();
		expect(refreshWritingEmbedsNow).not.toHaveBeenCalled();
	});

	it('force-rebuilds embeds once the live-preview field reads true', async () => {
		const livePreviewState = new FakeCmState(new Map([[editorLivePreviewField, true]]));
		refreshLivePreviewEmbedsWhenReady(makePlugin(makeMarkdownView(livePreviewState)));
		await flushInitialMicrotask();

		const drainedFrames = drainScheduledFrames();

		expect(drainedFrames).toBe(1);
		expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
		expect(clearAllInkCmScrollerScrollLocks).toHaveBeenCalledWith(
			'forceRebuild-live-preview-refresh',
		);
		expect(refreshDrawingEmbedsNow).toHaveBeenCalledWith(undefined, { forceRebuild: true });
		expect(refreshWritingEmbedsNow).toHaveBeenCalledWith(undefined, { forceRebuild: true });
	});
});
