import * as React from 'react';
import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { render } from '@testing-library/react';
import {
	DRAWING_EMBED_TOOLBAR_COMPACT_CLASS,
	useDrawingEmbedToolbarCompact,
} from 'src/components/formats/current/drawing/drawing-editor/use-drawing-embed-toolbar-compact';

//////////

interface ClusterLayout {
	left: DOMRect;
	center: DOMRect;
	right: DOMRect;
}

/** Builds a DOMRect-like object for stubbing getBoundingClientRect. */
function rect(left: number, width: number, top = 0, height = 40): DOMRect {
	return {
		left,
		right: left + width,
		top,
		bottom: top + height,
		width,
		height,
		x: left,
		y: top,
		toJSON: () => ({}),
	} as DOMRect;
}

const overlappingLayout: ClusterLayout = {
	left: rect(0, 80),
	center: rect(70, 80),
	right: rect(140, 60),
};

const wideLayout: ClusterLayout = {
	left: rect(0, 40),
	center: rect(100, 80),
	right: rect(240, 40),
};

/** 6px clearance: still overlapping for the 12px exit gap, not for the 4px enter gap. */
const hysteresisLayout: ClusterLayout = {
	left: rect(0, 80),
	center: rect(86, 80),
	right: rect(240, 40),
};

let clusterLayout: ClusterLayout = wideLayout;
let lastResizeObserverCallback: ResizeObserverCallback | null = null;

export interface ToolbarCompactHarnessProps {
	enabled: boolean;
}

/** Minimal drawing-editor chrome so the compact-layout hook can measure clusters. */
function ToolbarCompactHarness(props: ToolbarCompactHarnessProps) {
	const editorWrapperRef = React.useRef<HTMLDivElement>(null);
	useDrawingEmbedToolbarCompact(editorWrapperRef, {
		enabled: props.enabled,
		isSaveCameraEnabled: false,
		showFingerDrawingToggle: false,
	});

	return (
		<div ref={editorWrapperRef} data-testid="drawing-editor">
			<div className="ink_primary-menu-bar">
				<div className="ink_quick-menu" />
				<div className="ink_tool-menu" />
				<div className="ink_extended-writing-menu" />
			</div>
		</div>
	);
}

/** Returns the editor wrapper under test. */
function getEditorEl(): HTMLElement {
	const editorEl = document.querySelector('[data-testid="drawing-editor"]');
	if (!(editorEl instanceof HTMLElement)) throw new Error('drawing editor missing');
	return editorEl;
}

describe('useDrawingEmbedToolbarCompact', () => {
	beforeEach(() => {
		clusterLayout = wideLayout;
		lastResizeObserverCallback = null;

		class MockResizeObserver {
			constructor(callback: ResizeObserverCallback) {
				lastResizeObserverCallback = callback;
			}
			observe() {}
			unobserve() {}
			disconnect() {}
		}
		global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

		jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
			this: HTMLElement,
		) {
			if (this.classList.contains('ink_quick-menu')) return clusterLayout.left;
			if (this.classList.contains('ink_tool-menu')) return clusterLayout.center;
			if (this.classList.contains('ink_extended-writing-menu')) return clusterLayout.right;
			return rect(0, 400);
		});

		jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	test('applies compact layout immediately when unlocked onto overlapping clusters', () => {
		clusterLayout = overlappingLayout;
		render(<ToolbarCompactHarness enabled={true} />);
		expect(getEditorEl().classList.contains(DRAWING_EMBED_TOOLBAR_COMPACT_CLASS)).toBe(true);
	});

	test('does not compact while disabled even when clusters overlap', () => {
		clusterLayout = overlappingLayout;
		render(<ToolbarCompactHarness enabled={false} />);
		expect(getEditorEl().classList.contains(DRAWING_EMBED_TOOLBAR_COMPACT_CLASS)).toBe(false);
	});

	test('checks overlap when enabling after the editor appears (snapshot load / unlock)', () => {
		clusterLayout = overlappingLayout;
		const { rerender } = render(<ToolbarCompactHarness enabled={false} />);
		expect(getEditorEl().classList.contains(DRAWING_EMBED_TOOLBAR_COMPACT_CLASS)).toBe(false);

		rerender(<ToolbarCompactHarness enabled={true} />);
		expect(getEditorEl().classList.contains(DRAWING_EMBED_TOOLBAR_COMPACT_CLASS)).toBe(true);
	});

	test('leaves wide layout when clusters have clearance on first measure', () => {
		clusterLayout = wideLayout;
		render(<ToolbarCompactHarness enabled={true} />);
		expect(getEditorEl().classList.contains(DRAWING_EMBED_TOOLBAR_COMPACT_CLASS)).toBe(false);
	});

	test('switches to compact when a later resize makes clusters overlap', () => {
		clusterLayout = wideLayout;
		render(<ToolbarCompactHarness enabled={true} />);
		expect(getEditorEl().classList.contains(DRAWING_EMBED_TOOLBAR_COMPACT_CLASS)).toBe(false);

		clusterLayout = overlappingLayout;
		if (!lastResizeObserverCallback) throw new Error('ResizeObserver was not attached');
		lastResizeObserverCallback([] as unknown as ResizeObserverEntry[], {} as ResizeObserver);

		expect(getEditorEl().classList.contains(DRAWING_EMBED_TOOLBAR_COMPACT_CLASS)).toBe(true);
	});

	test('keeps compact through the exit hysteresis gap while resizing wider', () => {
		clusterLayout = overlappingLayout;
		render(<ToolbarCompactHarness enabled={true} />);
		expect(getEditorEl().classList.contains(DRAWING_EMBED_TOOLBAR_COMPACT_CLASS)).toBe(true);

		clusterLayout = hysteresisLayout;
		if (!lastResizeObserverCallback) throw new Error('ResizeObserver was not attached');
		lastResizeObserverCallback([] as unknown as ResizeObserverEntry[], {} as ResizeObserver);

		expect(getEditorEl().classList.contains(DRAWING_EMBED_TOOLBAR_COMPACT_CLASS)).toBe(true);

		clusterLayout = wideLayout;
		lastResizeObserverCallback([] as unknown as ResizeObserverEntry[], {} as ResizeObserver);
		expect(getEditorEl().classList.contains(DRAWING_EMBED_TOOLBAR_COMPACT_CLASS)).toBe(false);
	});
});
