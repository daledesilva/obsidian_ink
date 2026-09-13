import { describe, expect, test } from '@jest/globals';
import {
	inkEmbedRememberMeasuredHeightPx,
	inkEmbedSyncWidgetRootMinHeightToContent,
} from 'src/logic/utils/ink-embed-height-cache';

//////////

describe('inkEmbedRememberMeasuredHeightPx', () => {
	test('ignores a remount shrink while editing by default', () => {
		const nextHeightPx = inkEmbedRememberMeasuredHeightPx({
			previousHeightPx: 400,
			nextHeightPx: 200,
			isInEditMode: true,
		});
		expect(nextHeightPx).toBe(400);
	});

	test('accepts a live shrink while editing when allowShrinkWhileEditing is set', () => {
		const nextHeightPx = inkEmbedRememberMeasuredHeightPx({
			previousHeightPx: 400,
			nextHeightPx: 200,
			isInEditMode: true,
			allowShrinkWhileEditing: true,
		});
		expect(nextHeightPx).toBe(200);
	});

	test('accepts a shrink after lock', () => {
		const nextHeightPx = inkEmbedRememberMeasuredHeightPx({
			previousHeightPx: 400,
			nextHeightPx: 200,
			isInEditMode: false,
		});
		expect(nextHeightPx).toBe(200);
	});
});

describe('inkEmbedSyncWidgetRootMinHeightToContent', () => {
	test('returns null when the widget root is missing', () => {
		expect(inkEmbedSyncWidgetRootMinHeightToContent({ widgetRootEl: null })).toBeNull();
	});

	test('sets widget-root minHeight from a drawing embed', () => {
		const widgetRootEl = document.createElement('div');
		widgetRootEl.className = 'ddc_ink_widget-root';
		widgetRootEl.style.minHeight = '400px';

		const embedEl = document.createElement('div');
		embedEl.className = 'ddc_ink_drawing-embed';
		Object.defineProperty(embedEl, 'offsetHeight', { configurable: true, value: 180 });
		widgetRootEl.appendChild(embedEl);
		document.body.appendChild(widgetRootEl);

		const contentHeightPx = inkEmbedSyncWidgetRootMinHeightToContent({ widgetRootEl });
		expect(contentHeightPx).toBe(180);
		expect(widgetRootEl.style.minHeight).toBe('180px');

		widgetRootEl.remove();
	});

	test('sets widget-root minHeight from a writing embed', () => {
		const widgetRootEl = document.createElement('div');
		widgetRootEl.className = 'ddc_ink_widget-root';

		const embedEl = document.createElement('div');
		embedEl.className = 'ddc_ink_writing-embed';
		Object.defineProperty(embedEl, 'offsetHeight', { configurable: true, value: 96 });
		widgetRootEl.appendChild(embedEl);

		const contentHeightPx = inkEmbedSyncWidgetRootMinHeightToContent({ widgetRootEl });
		expect(contentHeightPx).toBe(96);
		expect(widgetRootEl.style.minHeight).toBe('96px');
	});
});
