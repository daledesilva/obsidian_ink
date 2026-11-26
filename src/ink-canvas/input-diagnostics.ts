import type { HandwritingExperiments } from 'src/logic/device-settings/handwriting-experiments';
import type { CameraState, InkPoint, InkStrokeStyle } from './types';

const MAX_SAMPLES = 30_000;
const MAX_POINTS = 30_000;
const MAX_COALESCED_PER_EVENT = 256;

function pointerSample(e: PointerEvent) {
	return {
		type: e.type, timeStamp: e.timeStamp, pointerId: e.pointerId, pointerType: e.pointerType,
		isPrimary: e.isPrimary, isTrusted: e.isTrusted, button: e.button, buttons: e.buttons,
		clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY,
		pressure: e.pressure, tangentialPressure: e.tangentialPressure,
		tiltX: e.tiltX, tiltY: e.tiltY, twist: e.twist, width: e.width, height: e.height,
	};
}

type PointerSample = ReturnType<typeof pointerSample>;
interface EventRecord {
	sequence: number;
	stage: 'blocker' | 'canvas';
	receivedAt: number;
	event: PointerSample;
	coalesced: PointerSample[];
	coalescedAvailable: boolean;
	coalescedError: boolean;
	coalescedTruncated: boolean;
	context: Record<string, unknown>;
}

export interface StrokeDiagnostic {
	strokeId: string;
	pointerId: number;
	phase: 'before-pointerup' | 'after-lift-sample' | 'committed' | 'cancelled';
	points: InkPoint[];
	style: InkStrokeStyle;
	experiments: HandwritingExperiments;
	inputPreference: string;
	resolvedInput: string;
	detectedInput?: string;
	camera: CameraState;
	containerRect: { left: number; top: number; width: number; height: number };
}

/** Opt-in, bounded, memory-only recorder. It never changes or retains DOM events. */
export class InputDiagnostics {
	private recording = false;
	private samples = 0;
	private points = 0;
	private session: {
		schemaVersion: 1;
		startedAt: string;
		stoppedAt?: string;
		stopReason?: string;
		metadata: Record<string, unknown>;
		events: EventRecord[];
		strokes: StrokeDiagnostic[];
	} | null = null;

	start(metadata: Record<string, unknown>): void {
		this.clear();
		this.session = { schemaVersion: 1, startedAt: new Date().toISOString(), metadata, events: [], strokes: [] };
		this.recording = true;
	}

	stop(reason = 'user'): void {
		if (!this.recording || !this.session) return;
		this.recording = false;
		this.session.stoppedAt = new Date().toISOString();
		this.session.stopReason = reason;
	}

	clear(): void {
		this.recording = false;
		this.session = null;
		this.samples = this.points = 0;
	}

	isRecording(): boolean { return this.recording; }

	status(): string {
		if (!this.session) return 'No recording. Data stays in memory until exported.';
		return `${this.recording ? 'Recording' : `Stopped (${this.session.stopReason})`}: ${this.session.events.length} events, ${this.session.strokes.length} stroke snapshots.`;
	}

	recordEvent(stage: EventRecord['stage'], e: PointerEvent, context?: () => Record<string, unknown>): void {
		if (!this.recording || !this.session) return;
		let coalesced: PointerEvent[] = [];
		const coalescedAvailable = typeof e.getCoalescedEvents === 'function';
		let coalescedError = false;
		if (coalescedAvailable) {
			try { coalesced = e.getCoalescedEvents() ?? []; }
			catch { coalescedError = true; }
		}
		const sampleCount = 1 + Math.min(coalesced.length, MAX_COALESCED_PER_EVENT);
		if (this.samples + sampleCount > MAX_SAMPLES) { this.stop('sample-limit'); return; }
		this.samples += sampleCount;
		this.session.events.push({
			sequence: this.session.events.length,
			stage, receivedAt: Date.now(), event: pointerSample(e),
			coalesced: coalesced.slice(0, MAX_COALESCED_PER_EVENT).map(pointerSample),
			coalescedAvailable, coalescedError,
			coalescedTruncated: coalesced.length > MAX_COALESCED_PER_EVENT,
			context: context?.() ?? {},
		});
	}

	recordStroke(value: StrokeDiagnostic): void {
		if (!this.recording || !this.session) return;
		if (this.points + value.points.length > MAX_POINTS) { this.stop('point-limit'); return; }
		this.points += value.points.length;
		// Capture by value: subsequent pointerup recomputation / selection must not rewrite evidence.
		this.session.strokes.push({
			...value, points: value.points.map(([x, y, p]) => [x, y, p]),
			style: { ...value.style }, experiments: { ...value.experiments },
			camera: { ...value.camera }, containerRect: { ...value.containerRect },
		});
	}

	exportJson(): string | null {
		if (!this.session) return null;
		return JSON.stringify({
			...this.session, recording: this.recording,
			limits: { samples: MAX_SAMPLES, points: MAX_POINTS, coalescedPerEvent: MAX_COALESCED_PER_EVENT },
			sampleCount: this.samples, pointCount: this.points,
		}, null, 2);
	}
}

export const inputDiagnostics = new InputDiagnostics();
