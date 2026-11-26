import { describe, expect, jest, test } from '@jest/globals';
import { InputDiagnostics } from 'src/ink-canvas/input-diagnostics';
import { DEFAULT_STROKE_STYLE, type InkPoint } from 'src/ink-canvas/types';
import { DEFAULT_HANDWRITING_EXPERIMENTS } from 'src/logic/device-settings/handwriting-experiments';

function pointer(extra = {}) {
	return { type: 'pointermove', timeStamp: 123.456, pointerId: 7, pointerType: 'pen', pressure: 0,
		clientX: 12.34, clientY: 56.78, tiltX: 12, tiltY: 30, isTrusted: true, ...extra } as PointerEvent;
}

describe('bounded input recorder', () => {
	test('disabled recording does not inspect coalesced input or evaluate layout context', () => {
		const recorder = new InputDiagnostics();
		const getCoalescedEvents = jest.fn(() => [pointer()]);
		const context = jest.fn(() => ({}));
		recorder.recordEvent('blocker', pointer({ getCoalescedEvents }), context);
		expect(getCoalescedEvents).not.toHaveBeenCalled();
		expect(context).not.toHaveBeenCalled();
		expect(recorder.exportJson()).toBeNull();
	});

	test('exports original timestamps, zero pressure and coalesced order separately from forwarded input', () => {
		const recorder = new InputDiagnostics(); recorder.start({ label: 'test' });
		const event = pointer({ getCoalescedEvents: () => [pointer({ timeStamp: 120 }), pointer({ timeStamp: 119 })] });
		recorder.recordEvent('blocker', event);
		recorder.recordEvent('canvas', pointer({ timeStamp: 125, isTrusted: false }));
		recorder.stop();
		const data = JSON.parse(recorder.exportJson()!);
		expect(data.events[0].event).toMatchObject({ timeStamp: 123.456, pressure: 0, tiltX: 12, clientX: 12.34 });
		expect(data.events[0].coalesced.map((s: { timeStamp: number }) => s.timeStamp)).toEqual([120, 119]);
		expect(data.events[1]).toMatchObject({ stage: 'canvas', event: { timeStamp: 125, isTrusted: false } });
		expect(event.pressure).toBe(0);
	});

	test('missing or throwing coalesced API does not disrupt capture', () => {
		const recorder = new InputDiagnostics(); recorder.start({});
		recorder.recordEvent('canvas', pointer());
		recorder.recordEvent('canvas', pointer({ getCoalescedEvents: () => { throw new Error('unsupported'); } }));
		const events = JSON.parse(recorder.exportJson()!).events;
		expect(events[0]).toMatchObject({ coalescedAvailable: false, coalesced: [] });
		expect(events[1]).toMatchObject({ coalescedAvailable: true, coalescedError: true, coalesced: [] });
	});

	test('oversized stroke snapshots stop recording without retaining a partial snapshot', () => {
		const recorder = new InputDiagnostics(); recorder.start({});
		recorder.recordStroke({ strokeId: 'large', pointerId: 1, phase: 'committed',
			points: Array.from({ length: 30_001 }, (): InkPoint => [0, 0, 0.5]),
			style: { ...DEFAULT_STROKE_STYLE }, experiments: { ...DEFAULT_HANDWRITING_EXPERIMENTS },
			inputPreference: 'pen', resolvedInput: 'pen', camera: { x: 0, y: 0, zoom: 1 },
			containerRect: { left: 0, top: 0, width: 800, height: 600 },
		});
		const data = JSON.parse(recorder.exportJson()!);
		expect(data.stopReason).toBe('point-limit');
		expect(data.strokes).toEqual([]);
		expect(data.pointCount).toBe(0);
	});

	test('sample limit stops recording explicitly and clear releases evidence', () => {
		const recorder = new InputDiagnostics(); recorder.start({});
		const event = pointer({ getCoalescedEvents: () => Array.from({ length: 300 }, () => pointer()) });
		for (let i = 0; i < 200; i++) recorder.recordEvent('blocker', event);
		const data = JSON.parse(recorder.exportJson()!);
		expect(data.sampleCount).toBeLessThanOrEqual(data.limits.samples);
		expect(data.stopReason).toBe('sample-limit');
		expect(data.events[0].coalescedTruncated).toBe(true);
		expect(recorder.isRecording()).toBe(false);
		recorder.clear(); expect(recorder.exportJson()).toBeNull();
	});
});
