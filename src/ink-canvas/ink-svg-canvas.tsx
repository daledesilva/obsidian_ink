import './ink-svg-canvas.scss';
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { getStroke } from 'perfect-freehand';
import { getSvgPathFromStroke } from './utils/svg-path-from-stroke';
import { StrokeStore } from './stroke-store';
import { UndoManager } from './undo-manager';
import { panByScreenDelta, zoomAtPoint, clampZoom, clampWritingCameraY, fitBoundsToViewport, screenToPage as screenToPageFn, getRightDragZoomDelta } from './camera';
import { computeStrokesBounds } from './svg-export';
import { cropWritingStrokeHeightInvitingly } from 'src/components/formats/current/utils/tldraw-helpers';
import { MENUBAR_HEIGHT_PX, WRITING_LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';
import { AddStrokeCommand, EraseAllCommand, RemoveStrokesCommand } from './commands';
import { drawToolPointerDown, drawToolPointerMove, drawToolPointerUp, drawToolPointerCancel } from './tools/draw-tool';
import { eraseToolPointerDown, eraseToolPointerMove, eraseToolPointerUp, eraseToolPointerCancel } from './tools/erase-tool';
import { selectToolPointerDown, selectToolPointerMove, selectToolPointerUp, selectToolPointerCancel } from './tools/select-tool';
import { FingerBlocker } from 'src/components/jsx-components/finger-blocker/finger-blocker';
import type { StrokeInputEditorKind } from 'src/logic/device-settings/device-settings-types';
import { useStrokeInputTreatAs } from 'src/logic/device-settings/use-stroke-input-treat-as';
import { toStrokeOptions, DEFAULT_STROKE_STYLE } from './types';
import type { InkTool, InkStrokeStyle, CameraState, InkCanvasSnapshot, InkCanvasEditor, InkStroke } from './types';
import type { DrawToolContext } from './tools/draw-tool';
import type { EraseToolContext } from './tools/erase-tool';
import type { SelectToolContext } from './tools/select-tool';
import { InkAdaptiveGrid } from './ink-adaptive-grid';
///////////////////////////
///////////////////////////

export interface InkSvgCanvasProps {
	initialSnapshot?: InkCanvasSnapshot;
	onEditorReady?: (editor: InkCanvasEditor) => void;
	onChange?: () => void;
	/** When true, space+drag pan is disabled. Use for embeds where the page scroll
	 *  should not be stolen by canvas pan gestures triggered by the Space key. */
	isEmbedded?: boolean;
	/** When true, applies writing-specific camera and gesture constraints. */
	writingMode?: boolean;
	/** Required when writingMode is true. Page width in page units (= WRITING_PAGE_WIDTH). */
	pageWidth?: number;
	/** Empty lines below content when growing page height (writing mode). Defaults to 3. */
	writingBufferLines?: number;
	/** Called when inviting page height should be recomputed (writing mode only). */
	onPageHeightChange?: (candidateHeightPx: number) => void;
	/** Dedicated writing view: vertical touch pan callback (screen pixels). */
	onDedicatedVerticalTouchPan?: (deltaY: number) => void;
	/** When true, ignore local draw/erase/select pointer input (Boox WebSocket creates strokes). */
	isBooxInputLocked?: boolean;
	/** When true, pen input pins the note scroller and blocks Obsidian swipe/scroll (embeds and Boox). */
	blockObsidianPenGestures?: boolean;
	/** After embed scroll / two-finger pan: reposition the Boox overlay (embedded + Boox only). */
	onBooxEmbedGeometryChange?: () => void;
}

export function InkSvgCanvas(props: InkSvgCanvasProps): React.JSX.Element {
	const writingMode = props.writingMode ?? false;
	const strokeInputEditorKind: StrokeInputEditorKind = writingMode ? 'inkWriting' : 'inkDrawing';
	const strokeInputTreatAs = useStrokeInputTreatAs(strokeInputEditorKind);
	const strokeInputTreatAsRef = useRef(strokeInputTreatAs);
	strokeInputTreatAsRef.current = strokeInputTreatAs;

	const pageWidth = props.pageWidth ?? WRITING_PAGE_WIDTH;
	const writingBufferLines = props.writingBufferLines ?? 3;
	const writingLineHeight = props.initialSnapshot?.writingLineHeight ?? WRITING_LINE_HEIGHT;

	const containerRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const liveStrokeRef = useRef<SVGPathElement>(null);
	const cameraGroupRef = useRef<SVGGElement>(null);

	function computeInitialPageHeight(): number {
		const strokes = props.initialSnapshot?.strokes ?? [];
		const contentHeight = strokes.length > 0
			? computeStrokesBounds(strokes).maxY
			: 0;
		return cropWritingStrokeHeightInvitingly(contentHeight, writingBufferLines, writingLineHeight);
	}

	const pageHeightRef = useRef(computeInitialPageHeight());
	const [pageHeightState, setPageHeightState] = useState(() => pageHeightRef.current);
	pageHeightRef.current = pageHeightState;

	const storeRef = useRef<StrokeStore>(null!);
	// Populate the store synchronously before the first render so strokes are visible
	// immediately. A useEffect would run after render, leaving the canvas blank until
	// something else triggers a re-render.
	if (!storeRef.current) {
		storeRef.current = new StrokeStore();
		if (props.initialSnapshot) storeRef.current.replaceAll(props.initialSnapshot.strokes);
	}

	const undoManagerRef = useRef(new UndoManager());

	const [tool, setTool] = useState<InkTool>('draw');
	const [strokeStyle, setStrokeStyle] = useState<InkStrokeStyle>({ ...DEFAULT_STROKE_STYLE });
	const [camera, setCameraState] = useState<CameraState>({ x: 0, y: 0, zoom: 1 });
	const [gridEnabled, setGridEnabledState] = useState(props.initialSnapshot?.gridEnabled ?? false);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [, forceRender] = useState(0);

	// Refs that stay in sync with state so tool callbacks see current values
	const cameraRef = useRef(camera);
	cameraRef.current = camera;
	const gridEnabledRef = useRef(gridEnabled);
	gridEnabledRef.current = gridEnabled;
	const onChangeRef = useRef(props.onChange);
	onChangeRef.current = props.onChange;
	const setGridEnabledHandlerRef = useRef<(enabled: boolean) => void>(() => {});
	setGridEnabledHandlerRef.current = (enabled: boolean) => {
		gridEnabledRef.current = enabled;
		setGridEnabledState(enabled);
		forceRender(n => n + 1);
		onChangeRef.current?.();
	};
	const toolRef = useRef(tool);
	toolRef.current = tool;
	const strokeStyleRef = useRef(strokeStyle);
	strokeStyleRef.current = strokeStyle;
	const selectedIdsRef = useRef(selectedIds);
	selectedIdsRef.current = selectedIds;
	const onDedicatedVerticalTouchPanRef = useRef(props.onDedicatedVerticalTouchPan);
	onDedicatedVerticalTouchPanRef.current = props.onDedicatedVerticalTouchPan;

	const getScrollContentBottomPageY = useCallback((): number => {
		const strokes = storeRef.current.getAll();
		if (strokes.length === 0) return WRITING_MIN_PAGE_HEIGHT;
		return Math.max(computeStrokesBounds(strokes).maxY, WRITING_MIN_PAGE_HEIGHT);
	}, []);

	const clampWritingY = useCallback((y: number, zoom: number): number => {
		const container = containerRef.current;
		if (!container) return y;
		const cameraYMax = props.isEmbedded ? 0 : MENUBAR_HEIGHT_PX;
		return clampWritingCameraY(
			y,
			zoom,
			container.clientHeight,
			getScrollContentBottomPageY(),
			cameraYMax,
		);
	}, [getScrollContentBottomPageY, props.isEmbedded]);

	const resetWritingCamera = useCallback((preserveY = false) => {
		const container = containerRef.current;
		if (!container) return;
		const zoom = container.clientWidth / pageWidth;
		let prevY: number;
		if (preserveY) {
			prevY = cameraRef.current.y;
		} else if (props.isEmbedded) {
			prevY = 0;
		} else {
			prevY = MENUBAR_HEIGHT_PX;
		}
		setCameraState({ x: 0, y: prevY, zoom });
	}, [pageWidth, props.isEmbedded]);

	// Camera is never persisted — fit on mount. Deferred one frame for real layout size.
	useEffect(() => {
		if (writingMode) {
			const frameId = requestAnimationFrame(() => {
				resetWritingCamera(false);
			});
			return () => cancelAnimationFrame(frameId);
		}

		const strokes = props.initialSnapshot?.strokes;
		const hasStrokes = (strokes?.length ?? 0) > 0;
		if (!hasStrokes) {
			const frameId = requestAnimationFrame(() => {
				const container = containerRef.current;
				if (!container) return;
				const zoom = container.clientWidth / pageWidth;
				setCameraState(prev => ({ ...prev, zoom }));
			});
			return () => cancelAnimationFrame(frameId);
		}

		const frameId = requestAnimationFrame(() => {
			const container = containerRef.current;
			if (!container) return;
			const rect = container.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return;
			const bounds = computeStrokesBounds(strokes!);
			if (bounds.width <= 0 || bounds.height <= 0) return;
			const fittedCamera = fitBoundsToViewport(rect.width, rect.height, {
				x: bounds.minX,
				y: bounds.minY,
				width: bounds.width,
				height: bounds.height,
			});
			setCameraState(fittedCamera);
		});
		return () => cancelAnimationFrame(frameId);
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Subscribe to store changes to re-render strokes
	useEffect(() => {
		const unsubStore = storeRef.current.subscribe(() => {
			forceRender(n => n + 1);
			props.onChange?.();

			if (writingMode) {
				const allStrokes = storeRef.current.getAll();
				const lh = props.initialSnapshot?.writingLineHeight ?? WRITING_LINE_HEIGHT;
				const contentHeight = allStrokes.length > 0
					? computeStrokesBounds(allStrokes).maxY
					: 0;
				const candidateHeight = cropWritingStrokeHeightInvitingly(
					contentHeight,
					writingBufferLines,
					lh,
				);
				props.onPageHeightChange?.(candidateHeight);
			}
		});
		const unsubUndo = undoManagerRef.current.subscribe(() => {
			forceRender(n => n + 1);
		});
		return () => { unsubStore(); unsubUndo(); };
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	// Writing mode: re-fit zoom when container width changes (not height — embed resize animates height)
	useEffect(() => {
		if (!writingMode) return;
		const container = containerRef.current;
		if (!container) return;

		let lastWidth = container.clientWidth;
		const resizeObserver = new ResizeObserver(() => {
			const width = container.clientWidth;
			if (props.isEmbedded && width === lastWidth) return;
			lastWidth = width;
			resetWritingCamera(!props.isEmbedded);
		});
		resizeObserver.observe(container);
		return () => resizeObserver.disconnect();
	}, [writingMode, props.isEmbedded, resetWritingCamera]);

	// Build the editor interface and expose it
	useEffect(() => {
		if (!props.onEditorReady) return;

		const editor: InkCanvasEditor = {
			undo: () => undoManagerRef.current.undo(),
			redo: () => undoManagerRef.current.redo(),
			canUndo: () => undoManagerRef.current.canUndo(),
			canRedo: () => undoManagerRef.current.canRedo(),
			getUndoCount: () => undoManagerRef.current.getUndoCount(),

			setTool: (t: InkTool) => setTool(t),
			getCurrentTool: () => toolRef.current,

			getStrokeStyle: () => ({ ...strokeStyleRef.current }),
			setStrokeStyle: (partial: Partial<InkStrokeStyle>) => {
				setStrokeStyle(prev => ({ ...prev, ...partial }));
			},

			getCamera: () => ({ ...cameraRef.current }),
			setCamera: (partial: Partial<CameraState>) => {
				setCameraState(prev => ({ ...prev, ...partial }));
			},

			isGridEnabled: () => gridEnabledRef.current,
			setGridEnabled: (enabled: boolean) => setGridEnabledHandlerRef.current(enabled),

			getSelectedStrokeIds: () => new Set(selectedIdsRef.current),
			deleteSelectedStrokes: () => {
				const ids = Array.from(selectedIdsRef.current);
				if (ids.length === 0) return;
				const cmd = new RemoveStrokesCommand(storeRef.current, ids);
				undoManagerRef.current.execute(cmd);
				setSelectedIds(new Set());
			},

			getSnapshot: (): InkCanvasSnapshot => ({
				version: 1,
				strokes: storeRef.current.getAll(),
				gridEnabled: gridEnabledRef.current,
				...(writingMode ? { writingLineHeight } : {}),
			}),

			eraseAll: () => {
				const cmd = new EraseAllCommand(storeRef.current);
				undoManagerRef.current.execute(cmd);
			},

			addStroke: (stroke: InkStroke) => {
				const cmd = new AddStrokeCommand(storeRef.current, stroke);
				undoManagerRef.current.execute(cmd);
				if (props.onChange) props.onChange();
			},

			screenToPage: (sx: number, sy: number) => {
				const rect = containerRef.current?.getBoundingClientRect() ?? new DOMRect();
				return screenToPageFn(cameraRef.current, rect, sx, sy);
			},

			getContainerElement: () => containerRef.current,
			getSvgElement: () => svgRef.current,

			getPageHeight: () => (writingMode ? pageHeightRef.current : 0),

			setWritingPageHeight: (height: number) => {
				if (!writingMode) return;
				if (height === pageHeightRef.current) return;
				pageHeightRef.current = height;
				setPageHeightState(height);
			},
		};

		props.onEditorReady(editor);
	}, []); // eslint-disable-line react-hooks/exhaustive-deps


	// Tool contexts
	///////////////////////////

	const getContainerRect = useCallback((): DOMRect => {
		return containerRef.current?.getBoundingClientRect() ?? new DOMRect();
	}, []);

	const drawCtx: DrawToolContext = {
		store: storeRef.current,
		undoManager: undoManagerRef.current,
		getCamera: () => cameraRef.current,
		getContainerRect,
		getStrokeStyle: () => ({ ...strokeStyleRef.current }),
		getStrokeInputTreatAs: () => strokeInputTreatAsRef.current,
		getLiveStrokePath: () => liveStrokeRef.current,
	};

	const eraseCtx: EraseToolContext = {
		store: storeRef.current,
		undoManager: undoManagerRef.current,
		getCamera: () => cameraRef.current,
		getContainerRect,
		getSvgElement: () => svgRef.current,
	};

	const selectCtx: SelectToolContext = {
		store: storeRef.current,
		undoManager: undoManagerRef.current,
		getCamera: () => cameraRef.current,
		getContainerRect,
		getSvgElement: () => svgRef.current,
		getSelectedStrokeIds: () => selectedIdsRef.current,
		setSelectedStrokeIds: (ids: Set<string>) => setSelectedIds(ids),
	};


	// Pointer event handlers
	///////////////////////////

	const isPanning = useRef(false);
	const lastPanPoint = useRef<{ x: number; y: number } | null>(null);

	// Right-drag zoom (Phase B)
	const isRightDraggingRef = useRef(false);
	const rightDragStartPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
	const rightDragInitialCameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: 1 });
	const rightDragFocalScreenRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
	const rightDragMovedRef = useRef(false);

	// Space+drag pan (Phase C)
	const isSpaceHeldRef = useRef(false);
	const isPointerOverCanvasRef = useRef(false);
	const [cursorStyle, setCursorStyle] = useState<React.CSSProperties['cursor']>(undefined);
	const isBooxInputLockedRef = useRef(props.isBooxInputLocked ?? false);
	isBooxInputLockedRef.current = props.isBooxInputLocked ?? false;

	// Discard any in-progress local stroke when Boox takes over input (matches tldraw lockTldrawInput).
	useEffect(() => {
		if (!props.isBooxInputLocked) return;
		drawToolPointerCancel({} as PointerEvent, drawCtx);
		eraseToolPointerCancel({} as PointerEvent, eraseCtx);
		selectToolPointerCancel({} as PointerEvent, selectCtx);
	}, [props.isBooxInputLocked]); // eslint-disable-line react-hooks/exhaustive-deps

	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		// Touch input: two-finger gestures are handled by the native touch listener.
		// Single-finger and other touch inputs are ignored here — let page scroll win.
		if (e.pointerType === 'touch') return;

		// Space + left-click → pan (disabled in embedded writing — note scrolls instead)
		const isSpacePanGesture = isSpaceHeldRef.current && e.button === 0;
		if (isSpacePanGesture) {
			if (writingMode && props.isEmbedded) return;
			isPanning.current = true;
			lastPanPoint.current = { x: e.clientX, y: e.clientY };
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
			setCursorStyle('grabbing');
			return;
		}

		// Middle-click → pan (disabled in embedded writing)
		if (e.button === 1) {
			if (writingMode && props.isEmbedded) return;
			e.preventDefault(); // Prevent autoscroll cursor
			isPanning.current = true;
			lastPanPoint.current = { x: e.clientX, y: e.clientY };
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
			setCursorStyle('grabbing');
			return;
		}

		// Right-click → drag-to-zoom (disabled in writing mode)
		if (e.button === 2) {
			if (writingMode) return;
			isRightDraggingRef.current = true;
			rightDragStartPointRef.current = { x: e.clientX, y: e.clientY };
			rightDragInitialCameraRef.current = { ...cameraRef.current };
			// Store container-relative focal point — zoomAtPoint expects these, not absolute client coords.
			const containerRect = containerRef.current?.getBoundingClientRect() ?? new DOMRect();
			rightDragFocalScreenRef.current = { x: e.clientX - containerRect.left, y: e.clientY - containerRect.top };
			rightDragMovedRef.current = false;
			// Stop native propagation so Obsidian's note-level handlers don't see the right-click.
			e.nativeEvent.stopPropagation();
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
			return;
		}

		if (!isBooxInputLockedRef.current) {
			if (toolRef.current === 'draw') drawToolPointerDown(e.nativeEvent, drawCtx);
			if (toolRef.current === 'erase') eraseToolPointerDown(e.nativeEvent, eraseCtx);
			if (toolRef.current === 'select') selectToolPointerDown(e.nativeEvent, selectCtx);
		}

		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

	const handlePointerMove = useCallback((e: React.PointerEvent) => {
		if (e.pointerType === 'touch') return;

		if (isPanning.current && lastPanPoint.current) {
			if (writingMode && !props.isEmbedded) {
				const dy = e.clientY - lastPanPoint.current.y;
				lastPanPoint.current = { x: e.clientX, y: e.clientY };
				setCameraState(prev => ({
					...prev,
					y: clampWritingY(prev.y + dy / prev.zoom, prev.zoom),
				}));
			} else {
				const dx = e.clientX - lastPanPoint.current.x;
				const dy = e.clientY - lastPanPoint.current.y;
				lastPanPoint.current = { x: e.clientX, y: e.clientY };
				setCameraState(prev => panByScreenDelta(prev, dx, dy));
			}
			return;
		}

		// Right-drag zoom
		if (isRightDraggingRef.current) {
			if (writingMode) return;
			const startPoint = rightDragStartPointRef.current;
			const dragZoomDelta = getRightDragZoomDelta(startPoint.x, startPoint.y, e.clientX, e.clientY);
			const hasMoved = Math.abs(dragZoomDelta) > 2;
			if (hasMoved) rightDragMovedRef.current = true;
			const factor = Math.exp(dragZoomDelta * 0.005);
			const initialCam = rightDragInitialCameraRef.current;
			const newZoom = clampZoom(initialCam.zoom * factor);
			const focal = rightDragFocalScreenRef.current;
			const zoomDelta = 1 / newZoom - 1 / initialCam.zoom;
			setCameraState({
				x: initialCam.x + focal.x * zoomDelta,
				y: initialCam.y + focal.y * zoomDelta,
				zoom: newZoom,
			});
			return;
		}

		if (!isBooxInputLockedRef.current) {
			if (toolRef.current === 'draw') drawToolPointerMove(e.nativeEvent, drawCtx);
			if (toolRef.current === 'erase') eraseToolPointerMove(e.nativeEvent, eraseCtx);
			if (toolRef.current === 'select') selectToolPointerMove(e.nativeEvent, selectCtx);
		}
	}, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

	const handlePointerUp = useCallback((e: React.PointerEvent) => {
		if (e.pointerType === 'touch') return;

		if (isPanning.current) {
			isPanning.current = false;
			lastPanPoint.current = null;
			const nextCursor = isSpaceHeldRef.current ? 'grab' : undefined;
			setCursorStyle(nextCursor);
			return;
		}

		if (isRightDraggingRef.current) {
			isRightDraggingRef.current = false;
			return;
		}

		if (!isBooxInputLockedRef.current) {
			if (toolRef.current === 'draw') drawToolPointerUp(e.nativeEvent, drawCtx);
			if (toolRef.current === 'erase') eraseToolPointerUp(e.nativeEvent, eraseCtx);
			if (toolRef.current === 'select') selectToolPointerUp(e.nativeEvent, selectCtx);
		}
	}, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

	const handlePointerCancel = useCallback((e: React.PointerEvent) => {
		if (e.pointerType === 'touch') return;

		if (isPanning.current) {
			isPanning.current = false;
			lastPanPoint.current = null;
			const nextCursor = isSpaceHeldRef.current ? 'grab' : undefined;
			setCursorStyle(nextCursor);
			return;
		}

		if (isRightDraggingRef.current) {
			isRightDraggingRef.current = false;
			return;
		}

		if (!isBooxInputLockedRef.current) {
			if (toolRef.current === 'draw') drawToolPointerCancel(e.nativeEvent, drawCtx);
			if (toolRef.current === 'erase') eraseToolPointerCancel(e.nativeEvent, eraseCtx);
			if (toolRef.current === 'select') selectToolPointerCancel(e.nativeEvent, selectCtx);
		}
	}, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

	const handleDrawingEmbedTwoFingerGesture = useCallback(
		(params: { deltaX: number; deltaY: number; anchorX: number; anchorY: number; distanceRatio: number }) => {
			const { deltaX, deltaY, anchorX, anchorY, distanceRatio } = params;
			setCameraState(prev => {
				const afterPan = panByScreenDelta(prev, deltaX, deltaY);
				const newZoom = clampZoom(afterPan.zoom * distanceRatio);
				const zoomDelta = 1 / newZoom - 1 / afterPan.zoom;
				return {
					x: afterPan.x + anchorX * zoomDelta,
					y: afterPan.y + anchorY * zoomDelta,
					zoom: newZoom,
				};
			});
		},
		[],
	);

	// Context-menu suppression
	// A native capture-phase listener fires before Obsidian's bubble-phase document-level
	// note context-menu handler. This ensures that right-clicking inside an embed never
	// shows the markdown note context menu — right-click on the canvas is always drag-to-zoom.
	// The toolbar overflow menu provides all note-level actions the user needs.
	///////////////////////////

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const suppressContextMenu = (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
		};
		container.addEventListener('contextmenu', suppressContextMenu, { capture: true });
		return () => container.removeEventListener('contextmenu', suppressContextMenu, { capture: true });
	}, []);


	// Wheel → zoom
	///////////////////////////

	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;

		const handleWheelNative = (e: WheelEvent) => {
			// Embedded writing: pass wheel through to the markdown note scroller
			if (writingMode && props.isEmbedded) {
				return;
			}
			if (writingMode && !props.isEmbedded) {
				if (e.ctrlKey || e.metaKey) return;
				e.preventDefault();
				const delta = e.deltaY * (e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1);
				setCameraState(prev => ({
					...prev,
					y: clampWritingY(prev.y - delta / prev.zoom, prev.zoom),
				}));
				return;
			}

			const isZoomModifier = e.ctrlKey || e.metaKey;
			if (isZoomModifier) {
				e.preventDefault();
				// zoomAtPoint expects container-relative coordinates, not absolute client coords.
				// In embeds the SVG is offset from the window origin, so we must subtract the rect.
				const svgRect = svg.getBoundingClientRect();
				const anchorX = e.clientX - svgRect.left;
				const anchorY = e.clientY - svgRect.top;
				const direction: 1 | -1 = e.deltaY < 0 ? -1 : 1;
				setCameraState(prev => zoomAtPoint(prev, anchorX, anchorY, direction));
				return;
			}
			// In dedicated view, plain wheel pans the canvas (both axes, so trackpad
			// two-finger swipes also work). In embeds the event passes through so the
			// Obsidian page scrolls normally.
			if (!props.isEmbedded) {
				e.preventDefault();
				setCameraState(prev => panByScreenDelta(prev, e.deltaX, e.deltaY));
			}
		};

		svg.addEventListener('wheel', handleWheelNative, { passive: false });
		return () => {
			svg.removeEventListener('wheel', handleWheelNative);
		};
	}, []);


	// Two-finger pinch/pan (Phase A)
	// Uses native touch events with passive:false so preventDefault can stop page scroll
	// during a two-finger gesture without interfering with single-finger page scroll.
	///////////////////////////

	useEffect(() => {
		// Embedded / Boox: two-finger drawing gestures are handled by FingerBlocker.
		if (props.blockObsidianPenGestures) return;

		const container = containerRef.current;
		if (!container) return;

		let prevMid = { x: 0, y: 0 };
		let prevDist = 0;
		let isGestureActive = false;

		const handleTouchStart = (e: TouchEvent) => {
			if (e.touches.length !== 2) return;
			// Embedded writing: let the note handle two-finger scroll
			if (writingMode && props.isEmbedded) return;
			e.preventDefault();
			isGestureActive = true;
			const t0 = e.touches[0];
			const t1 = e.touches[1];
			prevMid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
			prevDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
		};

		const handleTouchMove = (e: TouchEvent) => {
			const isTwoFingerGesture = e.touches.length >= 2 && isGestureActive;
			if (!isTwoFingerGesture) return;
			e.preventDefault();
			const t0 = e.touches[0];
			const t1 = e.touches[1];
			const newMid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
			const newDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
			const dx = newMid.x - prevMid.x;
			const dy = newMid.y - prevMid.y;

			if (writingMode && !props.isEmbedded) {
				const dedicatedPan = onDedicatedVerticalTouchPanRef.current;
				// Negate so finger-up scrolls down (matches FingerBlocker / wheel handler sign).
				const scrollDeltaY = -dy;
				if (dedicatedPan) {
					dedicatedPan(scrollDeltaY);
				} else {
					setCameraState(prev => ({
						...prev,
						y: clampWritingY(prev.y - dy / prev.zoom, prev.zoom),
					}));
				}
			} else if (!writingMode) {
				const ratio = prevDist > 0 ? newDist / prevDist : 1;
				// Pan delta (dx/dy) is already relative — it's a difference of two client coords.
				// The zoom anchor must be container-relative; zoomAtPoint expects this, not absolute client coords.
				const containerRect = container.getBoundingClientRect();
				const anchorX = newMid.x - containerRect.left;
				const anchorY = newMid.y - containerRect.top;
				setCameraState(prev => {
					const afterPan = panByScreenDelta(prev, dx, dy);
					const newZoom = clampZoom(afterPan.zoom * ratio);
					const zoomDelta = 1 / newZoom - 1 / afterPan.zoom;
					return {
						x: afterPan.x + anchorX * zoomDelta,
						y: afterPan.y + anchorY * zoomDelta,
						zoom: newZoom,
					};
				});
			}
			prevMid = newMid;
			prevDist = newDist;
		};

		const handleTouchEnd = (e: TouchEvent) => {
			if (e.touches.length < 2) isGestureActive = false;
		};

		container.addEventListener('touchstart', handleTouchStart, { passive: false });
		container.addEventListener('touchmove', handleTouchMove, { passive: false });
		container.addEventListener('touchend', handleTouchEnd);
		container.addEventListener('touchcancel', handleTouchEnd);
		return () => {
			container.removeEventListener('touchstart', handleTouchStart);
			container.removeEventListener('touchmove', handleTouchMove);
			container.removeEventListener('touchend', handleTouchEnd);
			container.removeEventListener('touchcancel', handleTouchEnd);
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps


	// Space+drag pan (Phase C)
	// Space key held + left-drag → pan. Only active when the pointer is over the canvas
	// to avoid stealing Space from other Obsidian UI (text editors, search boxes, etc).
	///////////////////////////

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const shouldActivate = e.key === ' ' && !e.repeat && !e.metaKey && !e.ctrlKey && isPointerOverCanvasRef.current && !props.isEmbedded;
			if (!shouldActivate) return;
			isSpaceHeldRef.current = true;
			setCursorStyle('grab');
			e.preventDefault();
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.key !== ' ') return;
			isSpaceHeldRef.current = false;
			if (!isPanning.current) setCursorStyle(undefined);
		};

		window.addEventListener('keydown', handleKeyDown, true);
		window.addEventListener('keyup', handleKeyUp, true);
		return () => {
			window.removeEventListener('keydown', handleKeyDown, true);
			window.removeEventListener('keyup', handleKeyUp, true);
		};
	}, []); // eslint-disable-line react-hooks/exhaustive-deps


	// Render strokes
	///////////////////////////

	const strokes = storeRef.current.getAll();

	const cameraTransform = `scale(${camera.zoom}) translate(${camera.x}, ${camera.y})`;

	// FingerBlocker must sit outside overflow:hidden so iOS can chain finger scroll to .cm-scroller
	// (matches release_0.5: blocker was a sibling of tldraw, not inside the clipped canvas).
	const canvasWrapperRef = useRef<HTMLDivElement>(null);

	return (
		<div
			ref={canvasWrapperRef}
			className="ink-svg-canvas-wrapper"
			style={{
				width: '100%',
				height: '100%',
				position: 'relative',
			}}
		>
			{props.blockObsidianPenGestures && (
				<FingerBlocker
					wrapperRef={canvasWrapperRef}
					enableTwoFingerGestures={!writingMode && !!props.isEmbedded}
					onVerticalTouchPan={
						writingMode && !props.isEmbedded
							? props.onDedicatedVerticalTouchPan
							: undefined
					}
					forwardPenToCanvas={!props.isBooxInputLocked}
					onDrawingEmbedTwoFingerGesture={
						!writingMode && props.isEmbedded ? handleDrawingEmbedTwoFingerGesture : undefined
					}
					onEmbedTwoFingerGestureEnd={
						!writingMode && props.isEmbedded ? props.onBooxEmbedGeometryChange : undefined
					}
				/>
			)}
			<div
				ref={containerRef}
				className="ink-svg-canvas-container"
				style={{
					width: '100%',
					height: '100%',
					overflow: 'hidden',
					touchAction: 'auto',
					position: 'relative',
					cursor: cursorStyle,
				}}
				onMouseEnter={() => { isPointerOverCanvasRef.current = true; }}
				onMouseLeave={() => { isPointerOverCanvasRef.current = false; }}
			>
			<svg
				ref={svgRef}
				className="ink-svg-canvas"
				style={{ width: '100%', height: '100%', display: 'block' }}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerCancel}
			>
				{!writingMode && gridEnabled && (
					<InkAdaptiveGrid
						x={camera.x}
						y={camera.y}
						z={camera.zoom}
					/>
				)}
				{/* Camera group — all content is transformed by the camera */}
				<g ref={cameraGroupRef} transform={cameraTransform}>
					{writingMode && (() => {
						const lh = writingLineHeight;
						const pw = pageWidth;
						const margin = pw * 0.05;
						const lineCount = Math.floor(pageHeightState / lh);
						return Array.from({ length: lineCount }, (_, i) => (
							<line
								key={i}
								x1={margin}
								y1={(i + 1) * lh}
								x2={pw - margin}
								y2={(i + 1) * lh}
								stroke="currentColor"
								strokeOpacity={0.15}
								strokeWidth={1 / camera.zoom}
							/>
						));
					})()}
					{/* Committed strokes */}
					{strokes.map(stroke => (
						<StrokePath
							key={stroke.id}
							stroke={stroke}
							isSelected={selectedIds.has(stroke.id)}
						/>
					))}

					{/* Live stroke (in-progress, drawn imperatively) */}
					<path
						ref={liveStrokeRef}
						fill={strokeStyle.color}
						pointerEvents="none"
					/>
				</g>
			</svg>
			</div>
		</div>
	);
}


// Stroke path component
///////////////////////////

interface StrokePathProps {
	stroke: InkStroke;
	isSelected: boolean;
}

function StrokePath(props: StrokePathProps): React.JSX.Element {
	const { stroke, isSelected } = props;
	// All strokes render through perfect-freehand's `getStroke` directly — the same call the
	// live preview makes (see `draw-tool.ts`), so committed strokes match what was drawn.
	const outlinePoints = getStroke(stroke.points, toStrokeOptions(stroke.style));
	const d = getSvgPathFromStroke(outlinePoints);

	const hasOffset = stroke.offset.x !== 0 || stroke.offset.y !== 0;

	return (
		<g
			data-stroke-group=""
			data-stroke-id={stroke.id}
			data-offset-x={stroke.offset.x}
			data-offset-y={stroke.offset.y}
			transform={hasOffset ? `translate(${stroke.offset.x}, ${stroke.offset.y})` : undefined}
		>
			<path
				data-stroke-id={stroke.id}
				d={d}
				fill={stroke.style.color}
			/>
			{isSelected && (
				<path
					d={d}
					fill="none"
					stroke="rgba(0, 123, 255, 0.6)"
					strokeWidth={2}
					pointerEvents="none"
				/>
			)}
		</g>
	);
}
