import { getStroke } from 'perfect-freehand';
import { eraserHitRadiusScreenPx } from './stroke-zoom-scale';
import { getSvgPathFromStroke } from './utils/svg-path-from-stroke';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
// Match Excalidraw's short time/length decay, keeping work independent of gesture length.
const TRAIL_DECAY_MS = 200;
const TRAIL_DECAY_POINTS = 10;
const MAX_TRAIL_POINTS = TRAIL_DECAY_POINTS + 1;

interface TrailPoint { x: number; y: number; time: number }

function easeOut(value: number): number {
	return 1 - (1 - value) ** 3;
}

/** Transient screen-space overlay. It never enters the stroke store or SVG export. */
export class EraserPreview {
	private path: SVGPathElement | null = null;
	private footprint: SVGCircleElement | null = null;
	private points: TrailPoint[] = [];
	private radius = 0;
	private active = false;
	private enabled = true;
	private view: Window | null = null;
	private frameId: number | null = null;

	constructor(
		private getElement: () => SVGGElement | null,
		private getContainerRect: () => DOMRect,
		private getCameraZoom: () => number,
	) {}

	/** Disabling clears any active/fading trail and cancels its animation immediately. */
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (!enabled) this.clear();
	}

	start(clientX: number, clientY: number, containerRect?: DOMRect): void {
		if (!this.enabled) return;
		this.clear();
		const element = this.getElement();
		if (!element) return;
		this.view = element.ownerDocument.defaultView;
		if (!this.view) return;
		this.radius = eraserHitRadiusScreenPx(this.getCameraZoom());
		this.active = true;
		this.path = element.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
		this.path.setAttribute('class', 'ink-canvas-eraser-trail');
		this.footprint = element.ownerDocument.createElementNS(SVG_NAMESPACE, 'circle');
		this.footprint.setAttribute('class', 'ink-canvas-eraser-footprint');
		element.append(this.path, this.footprint);
		element.setAttribute('visibility', 'visible');
		this.move(clientX, clientY, containerRect);
	}

	move(clientX: number, clientY: number, containerRect?: DOMRect): void {
		if (!this.active || !this.view) return;
		const rect = containerRect ?? this.getContainerRect();
		const x = clientX - rect.left;
		const y = clientY - rect.top;
		const last = this.points[this.points.length - 1];
		if (last?.x === x && last.y === y) return;
		this.points.push({ x, y, time: this.view.performance.now() });
		if (this.points.length > MAX_TRAIL_POINTS) this.points = this.points.slice(-MAX_TRAIL_POINTS);
		this.render();
		this.scheduleFrame();
	}

	/** Release fades the remaining tail; cancel/tool changes use clear() immediately. */
	end(): void {
		this.active = false;
		this.render();
		this.scheduleFrame();
	}

	private scheduleFrame(): void {
		if (!this.view || this.frameId !== null || this.points.length === 0) return;
		// Once the tail has gone, a stationary active head needs no animation work.
		if (this.active && this.points.length === 1) return;
		this.frameId = this.view.requestAnimationFrame(() => {
			this.frameId = null;
			this.render();
			this.scheduleFrame();
		});
	}

	private render(): void {
		if (!this.path || !this.footprint || !this.view) return;
		const now = this.view.performance.now();
		const lastIndex = this.points.length - 1;
		this.points = this.points.filter((point, index) =>
			now - point.time < TRAIL_DECAY_MS || (this.active && index === lastIndex),
		);
		const head = this.points[this.points.length - 1];
		if (!head) { this.clear(); return; }
		const ageStrength = (point: TrailPoint) => easeOut(Math.max(0, 1 - (now - point.time) / TRAIL_DECAY_MS));
		const headStrength = this.active ? 1 : ageStrength(head);
		this.footprint.setAttribute('cx', String(head.x));
		this.footprint.setAttribute('cy', String(head.y));
		// The active head is centered on the input and shows the exact hit-test radius.
		this.footprint.setAttribute('r', String(this.radius * headStrength));
		const trail = this.points.map((point, index) => {
			const lengthStrength = easeOut(Math.max(0, 1 - (this.points.length - 1 - index) / TRAIL_DECAY_POINTS));
			return [point.x, point.y, Math.min(ageStrength(point), lengthStrength)];
		});
		if (this.active) trail[trail.length - 1][2] = 1;
		// With thinning=1, PF's radius is size * pressure. This is display geometry only.
		this.path.setAttribute('d', trail.length > 1 ? getSvgPathFromStroke(getStroke(trail, {
			size: this.radius, thinning: 1, simulatePressure: false,
			streamline: 0, smoothing: 0.1, start: { taper: this.radius }, last: true,
		})) : '');
	}

	clear(): void {
		if (this.frameId !== null) this.view?.cancelAnimationFrame(this.frameId);
		this.frameId = null;
		const element = this.getElement();
		if (element) {
			element.setAttribute('visibility', 'hidden');
			element.replaceChildren();
		}
		this.path = null;
		this.footprint = null;
		this.points = [];
		this.active = false;
		this.view = null;
	}
}
