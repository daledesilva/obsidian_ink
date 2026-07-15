/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from '@jest/globals';
import {
	prepareLiveStrokeCanvas,
	resolveCanvasFillColor,
} from './live-stroke-canvas';

describe('live-stroke-canvas', () => {
	it('resolves currentColor from the host computed style', () => {
		const host = document.createElement('div');
		host.style.color = 'rgb(12, 34, 56)';
		document.body.appendChild(host);
		expect(resolveCanvasFillColor('currentColor', host)).toBe('rgb(12, 34, 56)');
		host.remove();
	});

	it('passes through concrete colours without reading the host', () => {
		expect(resolveCanvasFillColor('#ff00aa', null)).toBe('#ff00aa');
	});

	it('sizes the canvas to the parent box at devicePixelRatio', () => {
		const parent = document.createElement('div');
		Object.defineProperty(parent, 'clientWidth', { value: 200 });
		Object.defineProperty(parent, 'clientHeight', { value: 100 });
		const canvas = document.createElement('canvas');
		const mockCtx = {
			setTransform: jest.fn(),
			clearRect: jest.fn(),
			fill: jest.fn(),
		};
		canvas.getContext = jest.fn(() => mockCtx) as unknown as typeof canvas.getContext;
		parent.appendChild(canvas);
		document.body.appendChild(parent);

		const originalDpr = window.devicePixelRatio;
		Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });

		const ctx = prepareLiveStrokeCanvas(canvas);
		expect(ctx).toBe(mockCtx);
		expect(canvas.width).toBe(400);
		expect(canvas.height).toBe(200);
		expect(mockCtx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);

		Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: originalDpr });
		parent.remove();
	});
});
