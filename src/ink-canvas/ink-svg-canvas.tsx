import './ink-svg-canvas.scss';
import React, { useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import { getStroke } from 'perfect-freehand';
import { getSvgPathFromStroke } from './utils/svg-path-from-stroke';
import { StrokeStore } from './stroke-store';
import { UndoManager } from './undo-manager';
import { panByScreenDelta, zoomAtPoint, clampZoom, clampWritingCameraY, fitBoundsToViewport, adjustCameraToPreservePagePointAtScreenTargets, screenToPage as screenToPageFn, getRightDragZoomDelta } from './camera';
import { createPanMomentumController, isTrackpadWheel, type PanMomentumController } from './pan-momentum';
import { computeStrokesBounds } from './svg-export';
import { cropWritingStrokeHeightInvitingly } from 'src/components/formats/current/utils/tldraw-helpers';
import { MENUBAR_HEIGHT_PX, WRITING_LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';
import { AddStrokeCommand, EraseAllCommand, RemoveStrokesCommand } from './commands';
import { drawToolPointerDown, drawToolPointerMove, drawToolPointerUp, drawToolPointerCancel } from './tools/draw-tool';
import { eraseToolPointerDown, eraseToolPointerMove, eraseToolPointerUp, eraseToolPointerCancel } from './tools/erase-tool';
import { selectToolPointerDown, selectToolPointerMove, selectToolPointerUp, selectToolPointerCancel } from './tools/select-tool';
import { FingerBlocker } from 'src/components/jsx-components/finger-blocker/finger-blocker';
import { resolveInkTouchGestureMode } from 'src/logic/touch-gesture-policy';
import type { StrokeInputEditorKind } from 'src/logic/device-settings/device-settings-types';
import { setLastDetectedStrokeInput } from 'src/logic/device-settings/device-settings';
import { useStrokeInputTreatAs } from 'src/logic/device-settings/use-stroke-input-treat-as';
import { useResolvedStrokeInputTreatAs } from 'src/logic/device-settings/use-resolved-stroke-input-treat-as';
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
	/** Emits whenever camera changes (pan/zoom/setCamera). */
	onCameraChange?: (camera: CameraState, containerRect: DOMRect, meta: { source: 'init' | 'user' | 'api' }) => void;
	/** If present in drawing mode, applies an explicit initial viewport instead of fit-to-strokes. */
	initialViewBox?: { x: number; y: number; width: number; height: number };
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
	/** Fired when a pan/scroll gesture ends (start flick momentum in parent if needed). */
	onPanGestureEnd?: () => void;
	/** When true, ignore local draw/erase/select pointer input (Boox WebSocket creates strokes). */
	isBooxInputLocked?: boolean;
	/** When true, pen input pins the note scroller and blocks Obsidian swipe/scroll (embeds and Boox). */
	blockObsidianPenGestures?: boolean;
	/** After embed scroll / two-finger pan: reposition the Boox overlay (embedded + Boox only). */
	onBooxEmbedGeometryChange?: () => void;
	/** Embedded blank drawing: zoom = containerWidth / viewBox.width (starts by matching writing scale). */
	writingAlignedZoom?: boolean;
}

export function InkSvgCanvas(props: InkSvgCanvasProps): React.JSX.Element {
	const writingMode = props.writingMode ?? false;
	const strokeInputEditorKind: StrokeInputEditorKind = writingMode ? 'inkWriting' : 'inkDrawing';
	const strokeInputTreatAsPreference = useStrokeInputTreatAs(strokeInputEditorKind);
	const strokeInputTreatAsPreferenceRef = useRef(strokeInputTreatAsPreference);
	strokeInputTreatAsPreferenceRef.current = strokeInputTreatAsPreference;
	const resolvedStrokeInputTreatAs = useResolvedStrokeInputTreatAs(strokeInputEditorKind);
	const resolvedStrokeInputTreatAsRef = useRef(resolvedStrokeInputTreatAs);
	resolvedStrokeInputTreatAsRef.current = resolvedStrokeInputTreatAs;

	const pageWidth = props.pageWidth ?? WRITING_PAGE_WIDTH;
	const writingBufferLines = props.writingBufferLines ?? 3;
	const writingLineHeight = props.initialSnapshot?.writingLineHeight ?? WRITING_LINE_HEIGHT;

	const canvasWrapperRef = useRef<HTMLDivElement>(null);
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
	const onCameraChangeRef = useRef(props.onCameraChange);
	onCameraChangeRef.current = props.onCameraChange;
	const emitCameraChange = useCallback((nextCamera: CameraState, meta: { source: 'init' | 'user' | 'api' }) => {
		const rect = containerRef.current?.getBoundingClientRect() ?? new DOMRect();
		onCameraChangeRef.current?.({ ...nextCamera }, rect, meta);
	}, []);
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
	const toolChangeListenersRef = useRef(new Set<(t: InkTool) => void>());
	const applyToolChange = useCallback((nextTool: InkTool) => {
		setTool(nextTool);
		toolChangeListenersRef.current.forEach((listener) => listener(nextTool));
	}, []);
	const strokeStyleRef = useRef(strokeStyle);
	strokeStyleRef.current = strokeStyle;
	const selectedIdsRef = useRef(selectedIds);
	selectedIdsRef.current = selectedIds;
	const onDedicatedVerticalTouchPanRef = useRef(props.onDedicatedVerticalTouchPan);
	onDedicatedVerticalTouchPanRef.current = props.onDedicatedVerticalTouchPan;
	const onPanGestureEndRef = useRef(props.onPanGestureEnd);
	onPanGestureEndRef.current = props.onPanGestureEnd;

	const panMomentumRef = useRef<PanMomentumController | null>(null);
	useEffect(() => {
		panMomentumRef.current = createPanMomentumController({
			axis: writingMode && !props.isEmbedded ? 'y' : 'xy',
		});
		return () => panMomentumRef.current?.cancel();
	}, [writingMode, props.isEmbedded]);

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

	const applyPanScreenDeltaImmediate = useCallback((deltaScreenX: number, deltaScreenY: number): boolean => {
		if (writingMode && !props.isEmbedded) {
			let hitClamp = false;
			setCameraState((prev) => {
				const newY = clampWritingY(prev.y + deltaScreenY / prev.zoom, prev.zoom);
				if (Math.abs(newY - prev.y) < 1e-9 && Math.abs(deltaScreenY) > 1e-9) {
					hitClamp = true;
				}
				const next = { ...prev, y: newY };
				emitCameraChange(next, { source: 'user' });
				return next;
			});
			return !hitClamp;
		}
		setCameraState((prev) => {
			const next = panByScreenDelta(prev, deltaScreenX, deltaScreenY);
			emitCameraChange(next, { source: 'user' });
			return next;
		});
		return true;
	}, [writingMode, props.isEmbedded, clampWritingY, emitCameraChange]);

	const applyPanScreenDelta = useCallback((deltaScreenX: number, deltaScreenY: number) => {
		panMomentumRef.current?.recordScreenDelta(deltaScreenX, deltaScreenY);
		applyPanScreenDeltaImmediate(deltaScreenX, deltaScreenY);
	}, [applyPanScreenDeltaImmediate]);

	const releasePanMomentum = useCallback(() => {
		const usesExternalWritingPan =
			writingMode && !props.isEmbedded && !!onDedicatedVerticalTouchPanRef.current;
		if (usesExternalWritingPan) {
			onPanGestureEndRef.current?.();
			return;
		}
		panMomentumRef.current?.release((deltaScreenX, deltaScreenY) =>
			applyPanScreenDeltaImmediate(deltaScreenX, deltaScreenY),
		);
	}, [writingMode, props.isEmbedded, applyPanScreenDeltaImmediate]);

	const cancelPanMomentum = useCallback(() => {
		panMomentumRef.current?.cancel();
	}, []);

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

	const initialViewBoxRef = useRef(props.initialViewBox);
	initialViewBoxRef.current = props.initialViewBox;

	const resetWritingAlignedDrawingCamera = useCallback((preserveY = false) => {
		const container = containerRef.current;
		const vb = initialViewBoxRef.current;
		if (!container || !vb || vb.width <= 0) return;
		const zoom = clampZoom(container.clientWidth / vb.width);
		const nextY = preserveY ? cameraRef.current.y : -vb.y;
		const next = { x: -vb.x, y: nextY, zoom };
		setCameraState(next);
		emitCameraChange(next, { source: 'api' });
	}, [emitCameraChange]);

	// Camera is never persisted — fit on mount. Use layout effect so initial camera applies before paint.
	useLayoutEffect(() => {
		if (writingMode) {
			resetWritingCamera(false);
			return;
		}

		// If a viewBox is provided (embeds), honor it as the initial camera.
		if (props.initialViewBox) {
			const container = containerRef.current;
			if (!container) return;
			const rect = container.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return;
			const vb = props.initialViewBox;
			if (props.writingAlignedZoom && props.isEmbedded) {
				const zoom = clampZoom(vb.width > 0 ? rect.width / vb.width : 1);
				const next = { x: -vb.x, y: -vb.y, zoom };
				setCameraState(next);
				emitCameraChange(next, { source: 'init' });
				return;
			}
			const zoomX = vb.width > 0 ? rect.width / vb.width : 1;
			const zoomY = vb.height > 0 ? rect.height / vb.height : 1;
			const zoom = clampZoom(Math.min(zoomX, zoomY));
			const next = { x: -vb.x, y: -vb.y, zoom };
			setCameraState(next);
			emitCameraChange(next, { source: 'init' });
			return;
		}

		const strokes = props.initialSnapshot?.strokes;
		const hasStrokes = (strokes?.length ?? 0) > 0;
		if (!hasStrokes) {
			const container = containerRef.current;
			if (!container) return;
			const zoom = container.clientWidth / pageWidth;
			setCameraState(prev => {
				const next = { ...prev, zoom };
				emitCameraChange(next, { source: 'init' });
				return next;
			});
			return;
		}

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
		emitCameraChange(fittedCamera, { source: 'init' });
	}, []); // eslint-disable-line -- stable effect deps

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
	}, []); // eslint-disable-line -- stable effect deps

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

	// Embedded blank drawing: re-fit zoom when container width changes (same as writing)
	useEffect(() => {
		if (writingMode || !props.isEmbedded || !props.writingAlignedZoom) return;
		const container = containerRef.current;
		if (!container) return;

		let lastWidth = container.clientWidth;
		const resizeObserver = new ResizeObserver(() => {
			const width = container.clientWidth;
			if (width === lastWidth) return;
			lastWidth = width;
			resetWritingAlignedDrawingCamera(true);
		});
		resizeObserver.observe(container);
		return () => resizeObserver.disconnect();
	}, [writingMode, props.isEmbedded, props.writingAlignedZoom, resetWritingAlignedDrawingCamera]);

	// Embedded drawing: keep page content under the embed's geometric center when resized
	useEffect(() => {
		if (writingMode || !props.isEmbedded || props.writingAlignedZoom) return;
		const container = containerRef.current;
		if (!container) return;

		let lastEmbedRect: DOMRect | null = null;
		let lastContainerRect: DOMRect | null = null;
		const resizeObserver = new ResizeObserver(() => {
			const containerRect = container.getBoundingClientRect();
			if (containerRect.width <= 0 || containerRect.height <= 0) return;

			const embedEl =
				container.closest<HTMLElement>('.ddc_ink_resize-container') ?? container;
			const embedRect = embedEl.getBoundingClientRect();

			if (lastEmbedRect && lastContainerRect) {
				const anchorScreenX = lastEmbedRect.left + lastEmbedRect.width / 2;
				const anchorScreenY = lastEmbedRect.top + lastEmbedRect.height / 2;
				const targetScreenX = embedRect.left + embedRect.width / 2;
				const targetScreenY = embedRect.top + embedRect.height / 2;
				const sizeChanged =
					embedRect.width !== lastEmbedRect.width ||
					embedRect.height !== lastEmbedRect.height;

				if (sizeChanged) {
					const prevContainerRect = lastContainerRect;
					setCameraState((prev) => {
						const next = adjustCameraToPreservePagePointAtScreenTargets(
							prev,
							prevContainerRect,
							anchorScreenX,
							anchorScreenY,
							containerRect,
							targetScreenX,
							targetScreenY,
						);
						if (next.x === prev.x && next.y === prev.y) return prev;
						emitCameraChange(next, { source: 'api' });
						return next;
					});
				}
			}
			lastEmbedRect = embedRect;
			lastContainerRect = containerRect;
		});
		resizeObserver.observe(container);
		return () => resizeObserver.disconnect();
	}, [writingMode, props.isEmbedded, props.writingAlignedZoom, emitCameraChange]);

	// Build the editor interface and expose it
	useEffect(() => {
		if (!props.onEditorReady) return;

		const editor: InkCanvasEditor = {
			undo: () => undoManagerRef.current.undo(),
			redo: () => undoManagerRef.current.redo(),
			canUndo: () => undoManagerRef.current.canUndo(),
			canRedo: () => undoManagerRef.current.canRedo(),
			getUndoCount: () => undoManagerRef.current.getUndoCount(),

			setTool: (t: InkTool) => applyToolChange(t),
			getCurrentTool: () => toolRef.current,
			subscribeToolChange: (listener: (tool: InkTool) => void) => {
				toolChangeListenersRef.current.add(listener);
				listener(toolRef.current);
				return () => {
					toolChangeListenersRef.current.delete(listener);
				};
			},

			getStrokeStyle: () => ({ ...strokeStyleRef.current }),
			setStrokeStyle: (partial: Partial<InkStrokeStyle>) => {
				setStrokeStyle(prev => ({ ...prev, ...partial }));
			},

			getCamera: () => ({ ...cameraRef.current }),
			setCamera: (partial: Partial<CameraState>) => {
				setCameraState(prev => {
					const next = { ...prev, ...partial };
					emitCameraChange(next, { source: 'api' });
					return next;
				});
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
	}, []); // eslint-disable-line -- stable effect deps


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
		getStrokeInputTreatAsPreference: () => strokeInputTreatAsPreferenceRef.current,
		getResolvedStrokeInputTreatAs: () => resolvedStrokeInputTreatAsRef.current,
		getLiveStrokePath: () => liveStrokeRef.current,
		onStrokeInputDetected: (detected) => {
			setLastDetectedStrokeInput(detected);
		},
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
	/** Middle-mouse drag: temporarily switches tool to erase, then restores. */
	const isMiddleButtonEraseActiveRef = useRef(false);
	const middleButtonToolBeforeEraseRef = useRef<InkTool | null>(null);
	const [cursorStyle, setCursorStyle] = useState<React.CSSProperties['cursor']>(undefined);
	const isBooxInputLockedRef = useRef(props.isBooxInputLocked ?? false);
	isBooxInputLockedRef.current = props.isBooxInputLocked ?? false;

	// Discard any in-progress local stroke when Boox takes over input (matches tldraw lockTldrawInput).
	useEffect(() => {
		if (!props.isBooxInputLocked) return;
		if (isMiddleButtonEraseActiveRef.current) {
			const previousTool = middleButtonToolBeforeEraseRef.current;
			if (previousTool) applyToolChange(previousTool);
			middleButtonToolBeforeEraseRef.current = null;
			isMiddleButtonEraseActiveRef.current = false;
		}
		drawToolPointerCancel({} as PointerEvent, drawCtx);
		eraseToolPointerCancel({} as PointerEvent, eraseCtx);
		selectToolPointerCancel({} as PointerEvent, selectCtx);
	}, [props.isBooxInputLocked]); // eslint-disable-line -- stable effect deps

	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		// Touch input: two-finger gestures are handled by the native touch listener.
		// Single-finger and other touch inputs are ignored here — let page scroll win.
		if (e.pointerType === 'touch') return;

		// Space + left-click → pan (disabled in embedded writing — note scrolls instead)
		const isSpacePanGesture = isSpaceHeldRef.current && e.button === 0;
		if (isSpacePanGesture) {
			if (writingMode && props.isEmbedded) return;
			cancelPanMomentum();
			isPanning.current = true;
			lastPanPoint.current = { x: e.clientX, y: e.clientY };
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
			setCursorStyle('grabbing');
			return;
		}

		// Right-click:
		// - Drag → pan (drawing embed / dedicated writing; not embedded writing)
		// - Mod + drag → zoom (disabled in writing mode)
		if (e.button === 2) {
			// Stop native propagation so Obsidian's note-level handlers don't see the right-click.
			e.nativeEvent.stopPropagation();

			const isModHeld = e.ctrlKey || e.metaKey;
			if (isModHeld) {
				if (writingMode) return;
				isRightDraggingRef.current = true;
				rightDragStartPointRef.current = { x: e.clientX, y: e.clientY };
				rightDragInitialCameraRef.current = { ...cameraRef.current };
				// Store container-relative focal point — zoomAtPoint expects these, not absolute client coords.
				const containerRect = containerRef.current?.getBoundingClientRect() ?? new DOMRect();
				rightDragFocalScreenRef.current = { x: e.clientX - containerRect.left, y: e.clientY - containerRect.top };
				rightDragMovedRef.current = false;
				(e.target as HTMLElement).setPointerCapture(e.pointerId);
				return;
			}

			// RMB drag → pan (embedded writing: suppress note menu only — no pan/scroll)
			if (writingMode && props.isEmbedded) return;
			cancelPanMomentum();
			isPanning.current = true;
			lastPanPoint.current = { x: e.clientX, y: e.clientY };
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
			setCursorStyle('grabbing');
			return;
		}

		// Middle-click: temporary eraser (all embeds and dedicated views).
		if (e.pointerType === 'mouse' && e.button === 1) {
			e.preventDefault();
			e.nativeEvent.stopPropagation();
			if (!isBooxInputLockedRef.current) {
				isMiddleButtonEraseActiveRef.current = true;
				middleButtonToolBeforeEraseRef.current = toolRef.current;
				applyToolChange('erase');
				eraseToolPointerDown(e.nativeEvent, eraseCtx);
			}
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
			return;
		}

		if (!isBooxInputLockedRef.current) {
			if (toolRef.current === 'draw') drawToolPointerDown(e.nativeEvent, drawCtx);
			if (toolRef.current === 'erase') eraseToolPointerDown(e.nativeEvent, eraseCtx);
			if (toolRef.current === 'select') selectToolPointerDown(e.nativeEvent, selectCtx);
		}

		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}, [tool]); // eslint-disable-line -- stable effect deps

	const handlePointerMove = useCallback((e: React.PointerEvent) => {
		if (e.pointerType === 'touch') return;

		if (isPanning.current && lastPanPoint.current) {
			const dx = e.clientX - lastPanPoint.current.x;
			const dy = e.clientY - lastPanPoint.current.y;
			lastPanPoint.current = { x: e.clientX, y: e.clientY };
			if (dx !== 0 || dy !== 0) {
				applyPanScreenDelta(dx, dy);
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
			const next = {
				x: initialCam.x + focal.x * zoomDelta,
				y: initialCam.y + focal.y * zoomDelta,
				zoom: newZoom,
			};
			setCameraState(next);
			emitCameraChange(next, { source: 'user' });
			return;
		}

		if (isMiddleButtonEraseActiveRef.current) {
			if (!isBooxInputLockedRef.current) {
				eraseToolPointerMove(e.nativeEvent, eraseCtx);
			}
			return;
		}

		if (!isBooxInputLockedRef.current) {
			if (toolRef.current === 'draw') drawToolPointerMove(e.nativeEvent, drawCtx);
			if (toolRef.current === 'erase') eraseToolPointerMove(e.nativeEvent, eraseCtx);
			if (toolRef.current === 'select') selectToolPointerMove(e.nativeEvent, selectCtx);
		}
	}, [tool]); // eslint-disable-line -- stable effect deps

	const handlePointerUp = useCallback((e: React.PointerEvent) => {
		if (e.pointerType === 'touch') return;

		if (isPanning.current) {
			isPanning.current = false;
			lastPanPoint.current = null;
			const nextCursor = isSpaceHeldRef.current ? 'grab' : undefined;
			setCursorStyle(nextCursor);
			releasePanMomentum();
			return;
		}

		if (isRightDraggingRef.current) {
			isRightDraggingRef.current = false;
			return;
		}

		if (isMiddleButtonEraseActiveRef.current) {
			isMiddleButtonEraseActiveRef.current = false;
			if (!isBooxInputLockedRef.current) {
				eraseToolPointerUp(e.nativeEvent, eraseCtx);
				const previousTool = middleButtonToolBeforeEraseRef.current;
				if (previousTool) applyToolChange(previousTool);
			}
			middleButtonToolBeforeEraseRef.current = null;
			return;
		}

		if (!isBooxInputLockedRef.current) {
			if (toolRef.current === 'draw') drawToolPointerUp(e.nativeEvent, drawCtx);
			if (toolRef.current === 'erase') eraseToolPointerUp(e.nativeEvent, eraseCtx);
			if (toolRef.current === 'select') selectToolPointerUp(e.nativeEvent, selectCtx);
		}
	}, [tool, releasePanMomentum]); // eslint-disable-line -- stable effect deps

	const handlePointerCancel = useCallback((e: React.PointerEvent) => {
		if (e.pointerType === 'touch') return;

		if (isPanning.current) {
			isPanning.current = false;
			lastPanPoint.current = null;
			const nextCursor = isSpaceHeldRef.current ? 'grab' : undefined;
			setCursorStyle(nextCursor);
			releasePanMomentum();
			return;
		}

		if (isRightDraggingRef.current) {
			isRightDraggingRef.current = false;
			return;
		}

		if (isMiddleButtonEraseActiveRef.current) {
			isMiddleButtonEraseActiveRef.current = false;
			if (!isBooxInputLockedRef.current) {
				eraseToolPointerCancel(e.nativeEvent, eraseCtx);
				const previousTool = middleButtonToolBeforeEraseRef.current;
				if (previousTool) applyToolChange(previousTool);
			}
			middleButtonToolBeforeEraseRef.current = null;
			return;
		}

		if (!isBooxInputLockedRef.current) {
			if (toolRef.current === 'draw') drawToolPointerCancel(e.nativeEvent, drawCtx);
			if (toolRef.current === 'erase') eraseToolPointerCancel(e.nativeEvent, eraseCtx);
			if (toolRef.current === 'select') selectToolPointerCancel(e.nativeEvent, selectCtx);
		}
	}, [tool]); // eslint-disable-line -- stable effect deps

	const handleDrawingEmbedTwoFingerGesture = useCallback(
		(params: { deltaX: number; deltaY: number; anchorX: number; anchorY: number; distanceRatio: number }) => {
			const { deltaX, deltaY, anchorX, anchorY, distanceRatio } = params;
			if (deltaX !== 0 || deltaY !== 0) {
				panMomentumRef.current?.recordScreenDelta(deltaX, deltaY);
			}
			setCameraState(prev => {
				const afterPan = panByScreenDelta(prev, deltaX, deltaY);
				const newZoom = clampZoom(afterPan.zoom * distanceRatio);
				const zoomDelta = 1 / newZoom - 1 / afterPan.zoom;
				const next = {
					x: afterPan.x + anchorX * zoomDelta,
					y: afterPan.y + anchorY * zoomDelta,
					zoom: newZoom,
				};
				emitCameraChange(next, { source: 'user' });
				return next;
			});
		},
		[emitCameraChange],
	);

	const handleEmbedTwoFingerGestureEnd = useCallback(() => {
		releasePanMomentum();
		props.onBooxEmbedGeometryChange?.();
	}, [releasePanMomentum, props.onBooxEmbedGeometryChange]);

	// Context-menu suppression
	// A native capture-phase listener fires before Obsidian's bubble-phase document-level
	// note context-menu handler. This ensures that right-clicking inside an embed never
	// shows the markdown note context menu — right-click on the canvas is reserved for pan/zoom.
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

	const wheelIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const applyPanScreenDeltaRef = useRef(applyPanScreenDelta);
	applyPanScreenDeltaRef.current = applyPanScreenDelta;
	const releasePanMomentumRef = useRef(releasePanMomentum);
	releasePanMomentumRef.current = releasePanMomentum;
	const cancelPanMomentumRef = useRef(cancelPanMomentum);
	cancelPanMomentumRef.current = cancelPanMomentum;

	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return;

		const TRACKPAD_WHEEL_IDLE_MS = 80;

		const clearTrackpadWheelIdleTimer = () => {
			if (wheelIdleTimerRef.current !== null) {
				window.clearTimeout(wheelIdleTimerRef.current);
				wheelIdleTimerRef.current = null;
			}
		};

		const scheduleTrackpadWheelRelease = () => {
			clearTrackpadWheelIdleTimer();
			wheelIdleTimerRef.current = window.setTimeout(() => {
				wheelIdleTimerRef.current = null;
				releasePanMomentumRef.current();
			}, TRACKPAD_WHEEL_IDLE_MS);
		};

		const handleWheelNative = (e: WheelEvent) => {
			// Embedded writing: pass wheel through to the markdown note scroller
			if (writingMode && props.isEmbedded) {
				return;
			}
			if (writingMode && !props.isEmbedded) {
				if (e.ctrlKey || e.metaKey) return;
				e.preventDefault();
				const delta = e.deltaY * (e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1);
				const usesExternalWritingPan = !!onDedicatedVerticalTouchPanRef.current;
				if (usesExternalWritingPan) {
					if (isTrackpadWheel(e)) {
						scheduleTrackpadWheelRelease();
					} else {
						clearTrackpadWheelIdleTimer();
						cancelPanMomentumRef.current();
					}
					onDedicatedVerticalTouchPanRef.current?.(delta);
					return;
				}
				if (isTrackpadWheel(e)) {
					applyPanScreenDeltaRef.current(0, -delta);
					scheduleTrackpadWheelRelease();
				} else {
					clearTrackpadWheelIdleTimer();
					cancelPanMomentumRef.current();
					setCameraState((prev) => {
						const next = {
							...prev,
							y: clampWritingY(prev.y - delta / prev.zoom, prev.zoom),
						};
						emitCameraChange(next, { source: 'user' });
						return next;
					});
				}
				return;
			}

			const isZoomModifier = e.ctrlKey || e.metaKey;
			if (isZoomModifier) {
				clearTrackpadWheelIdleTimer();
				cancelPanMomentumRef.current();
				e.preventDefault();
				const svgRect = svg.getBoundingClientRect();
				const anchorX = e.clientX - svgRect.left;
				const anchorY = e.clientY - svgRect.top;
				const direction: 1 | -1 = e.deltaY < 0 ? -1 : 1;
				setCameraState((prev) => {
					const next = zoomAtPoint(prev, anchorX, anchorY, direction);
					emitCameraChange(next, { source: 'user' });
					return next;
				});
				return;
			}
			if (!props.isEmbedded) {
				e.preventDefault();
				if (isTrackpadWheel(e)) {
					applyPanScreenDeltaRef.current(e.deltaX, e.deltaY);
					scheduleTrackpadWheelRelease();
				} else {
					clearTrackpadWheelIdleTimer();
					cancelPanMomentumRef.current();
					setCameraState((prev) => {
						const next = panByScreenDelta(prev, e.deltaX, e.deltaY);
						emitCameraChange(next, { source: 'user' });
						return next;
					});
				}
			}
		};

		svg.addEventListener('wheel', handleWheelNative, { passive: false });
		return () => {
			clearTrackpadWheelIdleTimer();
			svg.removeEventListener('wheel', handleWheelNative);
		};
	}, [writingMode, props.isEmbedded, clampWritingY, emitCameraChange]);


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
	}, []); // eslint-disable-line -- stable effect deps


	// Render strokes
	///////////////////////////

	const strokes = storeRef.current.getAll();

	const cameraTransform = `scale(${camera.zoom}) translate(${camera.x}, ${camera.y})`;

	const inkTouchGestureMode = resolveInkTouchGestureMode({
		writingMode,
		isEmbedded: !!props.isEmbedded,
		hasDedicatedVerticalTouchPan: writingMode && !props.isEmbedded && !!props.onDedicatedVerticalTouchPan,
	});

	// FingerBlocker must sit outside overflow:hidden so iOS can chain finger scroll to .cm-scroller
	// (matches release_0.5: blocker was a sibling of tldraw, not inside the clipped canvas).
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
			<FingerBlocker
				wrapperRef={canvasWrapperRef}
				touchGestureMode={inkTouchGestureMode}
				enableMiddleButtonTemporaryErase
				onVerticalTouchPan={
					writingMode && !props.isEmbedded
						? props.onDedicatedVerticalTouchPan
						: undefined
				}
				forwardPenToCanvas={!props.isBooxInputLocked}
				onDrawingEmbedTwoFingerGesture={
					!writingMode ? handleDrawingEmbedTwoFingerGesture : undefined
				}
				onPanGestureEnd={props.onPanGestureEnd}
				onEmbedTwoFingerGestureEnd={
					!writingMode ? handleEmbedTwoFingerGestureEnd : undefined
				}
				onTouchGestureSessionStart={cancelPanMomentum}
			/>
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
								strokeOpacity={0.5}
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
