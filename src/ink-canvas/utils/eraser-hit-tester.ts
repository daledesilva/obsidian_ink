import { screenToPage } from '../camera';
import { getRenderedStrokeData, type RenderedStrokeBounds } from '../rendered-stroke-cache';
import type { StrokeStore } from '../stroke-store';
import { computeApproxStrokePageBounds, pageRectsIntersect, type PageRect } from '../stroke-viewport-culling';
import type { CameraState, InkStroke } from '../types';
import type { ClientPoint } from './eraser-hit-samples';

interface CachedGeometry {
	bounds: PageRect;
	path?: Path2D;
	exactBounds?: RenderedStrokeBounds;
}

/** Dense picking against the same SVG path as rendering, without per-point DOM queries. */
export class EraserHitTester {
	private geometry = new WeakMap<InkStroke, CachedGeometry>();
	private native: { context: CanvasRenderingContext2D; Path: typeof Path2D } | null | undefined;
	private clipAncestors: { element: Element; x: boolean; y: boolean }[] | null = null;

	constructor(private store: StrokeStore, private getSvg: () => SVGSVGElement | null) {}

	begin(): void { this.clipAncestors = null; }

	/** Null requests the existing browser picking fallback on unsupported runtimes. */
	hitTest(samples: ClientPoint[], camera: CameraState, rect: DOMRect): Set<string> | null {
		const svg = this.getSvg();
		if (!svg) return new Set();
		if (!this.init(svg)) return null;
		const native = this.native!;
		const hits = new Set<string>();
		if (samples.length === 0) return hits;
		const view = svg.ownerDocument.defaultView!;
		const clip = {
			left: Math.max(0, rect.left), top: Math.max(0, rect.top),
			right: Math.min(view.innerWidth, rect.right), bottom: Math.min(view.innerHeight, rect.bottom),
		};
		if (!this.clipAncestors) {
			this.clipAncestors = [];
			for (let element = svg.parentElement; element; element = element.parentElement) {
				const style = view.getComputedStyle(element);
				const x = /^(auto|scroll|hidden|clip)$/.test(style.overflowX || style.overflow);
				const y = /^(auto|scroll|hidden|clip)$/.test(style.overflowY || style.overflow);
				if (x || y) this.clipAncestors.push({ element, x, y });
			}
		}
		for (const ancestor of this.clipAncestors) {
			const bounds = ancestor.element.getBoundingClientRect();
			if (ancestor.x) { clip.left = Math.max(clip.left, bounds.left); clip.right = Math.min(clip.right, bounds.right); }
			if (ancestor.y) { clip.top = Math.max(clip.top, bounds.top); clip.bottom = Math.min(clip.bottom, bounds.bottom); }
		}
		const points: ClientPoint[] = [];
		const probeBounds: PageRect = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
		for (const sample of samples) {
			if (sample.x < clip.left || sample.x >= clip.right || sample.y < clip.top || sample.y >= clip.bottom) continue;
			const point = screenToPage(camera, rect, sample.x, sample.y);
			points.push(point);
			probeBounds.minX = Math.min(probeBounds.minX, point.x);
			probeBounds.minY = Math.min(probeBounds.minY, point.y);
			probeBounds.maxX = Math.max(probeBounds.maxX, point.x);
			probeBounds.maxY = Math.max(probeBounds.maxY, point.y);
		}
		if (points.length === 0) return hits;
		const candidates: { stroke: InkStroke; geometry: CachedGeometry }[] = [];
		const strokes = this.store.getAll();
		// Reverse painter order preserves the existing topmost-stroke-per-point rule.
		for (let index = strokes.length - 1; index >= 0; index--) {
			const stroke = strokes[index];
			let geometry = this.geometry.get(stroke);
			if (!geometry) {
				geometry = { bounds: computeApproxStrokePageBounds(stroke) };
				this.geometry.set(stroke, geometry);
			}
			if (pageRectsIntersect(geometry.bounds, probeBounds)) candidates.push({ stroke, geometry });
		}
		for (const point of points) {
			for (const { stroke, geometry } of candidates) {
				if (!contains(geometry.bounds, point.x, point.y)) continue;
				if (!geometry.path) {
					const rendered = getRenderedStrokeData(stroke);
					geometry.path = new native.Path(rendered.pathD);
					geometry.exactBounds = rendered.bounds;
				}
				const x = point.x - stroke.offset.x, y = point.y - stroke.offset.y;
				if (contains(geometry.exactBounds!, x, y) && native.context.isPointInPath(geometry.path, x, y)) {
					hits.add(stroke.id);
					break;
				}
			}
			if (hits.size === candidates.length) break;
		}
		return hits;
	}

	private init(svg: SVGSVGElement): boolean {
		if (this.native !== undefined) return this.native !== null;
		this.native = null;
		const Path = (svg.ownerDocument.defaultView as (Window & { Path2D?: typeof Path2D }) | null)?.Path2D;
		if (typeof Path !== 'function') return false;
		try {
			const canvas = svg.ownerDocument.createElement('canvas');
			canvas.width = canvas.height = 1;
			const context = canvas.getContext('2d');
			if (context && typeof context.isPointInPath === 'function'
				&& context.isPointInPath(new Path('M0 0h1v1h-1Z'), 0.5, 0.5)) {
				this.native = { context, Path };
			}
		} catch { /* Older WebViews keep the original browser picking fallback. */ }
		return this.native !== null;
	}
}

function contains(bounds: PageRect, x: number, y: number): boolean {
	return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}
