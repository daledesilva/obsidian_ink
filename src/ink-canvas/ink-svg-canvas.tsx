import React, { useEffect, useRef, useCallback, useState } from 'react';
import { getStroke } from 'perfect-freehand';
import { getSvgPathFromStroke } from './utils/svg-path-from-stroke';
import { StrokeStore } from './stroke-store';
import { UndoManager } from './undo-manager';
import { panByScreenDelta, zoomAtPoint, clampZoom, fitBoundsToViewport, screenToPage as screenToPageFn } from './camera';
import { computeStrokesBounds } from './svg-export';
import { AddStrokeCommand, EraseAllCommand, RemoveStrokesCommand } from './commands';
import { drawToolPointerDown, drawToolPointerMove, drawToolPointerUp, drawToolPointerCancel } from './tools/draw-tool';
import { eraseToolPointerDown, eraseToolPointerMove, eraseToolPointerUp, eraseToolPointerCancel } from './tools/erase-tool';
import { selectToolPointerDown, selectToolPointerMove, selectToolPointerUp, selectToolPointerCancel } from './tools/select-tool';
import { toStrokeOptions, DEFAULT_STROKE_STYLE } from './types';
import type { InkTool, InkStrokeStyle, CameraState, InkCanvasSnapshot, InkCanvasEditor, InkStroke } from './types';
import type { DrawToolContext } from './tools/draw-tool';
import type { EraseToolContext } from './tools/erase-tool';
import type { SelectToolContext } from './tools/select-tool';

///////////////////////////
///////////////////////////

export interface InkSvgCanvasProps {
	initialSnapshot?: InkCanvasSnapshot;
	onEditorReady?: (editor: InkCanvasEditor) => void;
	onChange?: () => void;
	/** When true, space+drag pan is disabled. Use for embeds where the page scroll
	 *  should not be stolen by canvas pan gestures triggered by the Space key. */
	isEmbedded?: boolean;
}

export function InkSvgCanvas(props: InkSvgCanvasProps): React.JSX.Element {
	const containerRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const liveStrokeRef = useRef<SVGPathElement>(null);
	const cameraGroupRef = useRef<SVGGElement>(null);

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
	const [gridEnabled, setGridEnabled] = useState(props.initialSnapshot?.gridEnabled ?? false);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [, forceRender] = useState(0);

	// Refs that stay in sync with state so tool callbacks see current values
	const cameraRef = useRef(camera);
	cameraRef.current = camera;
	const toolRef = useRef(tool);
	toolRef.current = tool;
	const strokeStyleRef = useRef(strokeStyle);
	strokeStyleRef.current = strokeStyle;
	const selectedIdsRef = useRef(selectedIds);
	selectedIdsRef.current = selectedIds;

	// Always fit camera to strokes on mount — camera is never persisted so the
	// view is always correct regardless of which context opens the canvas.
	// Deferred one frame so the container has real layout dimensions.
	useEffect(() => {
		const strokes = props.initialSnapshot?.strokes;
		const hasStrokes = (strokes?.length ?? 0) > 0;
		if (!hasStrokes) return;

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
		});
		const unsubUndo = undoManagerRef.current.subscribe(() => {
			forceRender(n => n + 1);
		});
		return () => { unsubStore(); unsubUndo(); };
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

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

			isGridEnabled: () => gridEnabled,
			setGridEnabled: (enabled: boolean) => setGridEnabled(enabled),

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
				gridEnabled,
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
	const rightDragStartYRef = useRef(0);
	const rightDragInitialCameraRef = useRef<CameraState>({ x: 0, y: 0, zoom: 1 });
	const rightDragFocalScreenRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
	const rightDragMovedRef = useRef(false);

	// Space+drag pan (Phase C)
	const isSpaceHeldRef = useRef(false);
	const isPointerOverCanvasRef = useRef(false);
	const [cursorStyle, setCursorStyle] = useState<React.CSSProperties['cursor']>(undefined);

	const handlePointerDown = useCallback((e: React.PointerEvent) => {
		// Touch input: two-finger gestures are handled by the native touch listener.
		// Single-finger and other touch inputs are ignored here — let page scroll win.
		if (e.pointerType === 'touch') return;

		// Space + left-click → pan
		const isSpacePanGesture = isSpaceHeldRef.current && e.button === 0;
		if (isSpacePanGesture) {
			isPanning.current = true;
			lastPanPoint.current = { x: e.clientX, y: e.clientY };
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
			setCursorStyle('grabbing');
			return;
		}

		// Middle-click → pan
		if (e.button === 1) {
			e.preventDefault(); // Prevent autoscroll cursor
			isPanning.current = true;
			lastPanPoint.current = { x: e.clientX, y: e.clientY };
			(e.target as HTMLElement).setPointerCapture(e.pointerId);
			setCursorStyle('grabbing');
			return;
		}

		// Right-click → drag-to-zoom
		if (e.button === 2) {
			isRightDraggingRef.current = true;
			rightDragStartYRef.current = e.clientY;
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

		if (toolRef.current === 'draw') drawToolPointerDown(e.nativeEvent, drawCtx);
		if (toolRef.current === 'erase') eraseToolPointerDown(e.nativeEvent, eraseCtx);
		if (toolRef.current === 'select') selectToolPointerDown(e.nativeEvent, selectCtx);

		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	}, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

	const handlePointerMove = useCallback((e: React.PointerEvent) => {
		if (e.pointerType === 'touch') return;

		if (isPanning.current && lastPanPoint.current) {
			const dx = e.clientX - lastPanPoint.current.x;
			const dy = e.clientY - lastPanPoint.current.y;
			lastPanPoint.current = { x: e.clientX, y: e.clientY };
			setCameraState(prev => panByScreenDelta(prev, dx, dy));
			return;
		}

		// Right-drag zoom
		if (isRightDraggingRef.current) {
			const deltaY = rightDragStartYRef.current - e.clientY;
			const hasMoved = Math.abs(deltaY) > 2;
			if (hasMoved) rightDragMovedRef.current = true;
			const factor = Math.exp(deltaY * 0.005);
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

		if (toolRef.current === 'draw') drawToolPointerMove(e.nativeEvent, drawCtx);
		if (toolRef.current === 'erase') eraseToolPointerMove(e.nativeEvent, eraseCtx);
		if (toolRef.current === 'select') selectToolPointerMove(e.nativeEvent, selectCtx);
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

		if (toolRef.current === 'draw') drawToolPointerUp(e.nativeEvent, drawCtx);
		if (toolRef.current === 'erase') eraseToolPointerUp(e.nativeEvent, eraseCtx);
		if (toolRef.current === 'select') selectToolPointerUp(e.nativeEvent, selectCtx);
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

		if (toolRef.current === 'draw') drawToolPointerCancel(e.nativeEvent, drawCtx);
		if (toolRef.current === 'erase') eraseToolPointerCancel(e.nativeEvent, eraseCtx);
		if (toolRef.current === 'select') selectToolPointerCancel(e.nativeEvent, selectCtx);
	}, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

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
			const isZoomModifier = e.ctrlKey || e.metaKey;
			if (isZoomModifier) {
				e.preventDefault();
				// zoomAtPoint expects container-relative coordinates, not absolute client coords.
				// In embeds the SVG is offset from the window origin, so we must subtract the rect.
				const svgRect = svg.getBoundingClientRect();
				const anchorX = e.clientX - svgRect.left;
				const anchorY = e.clientY - svgRect.top;
				const direction: 1 | -1 = e.deltaY < 0 ? 1 : -1;
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
		const container = containerRef.current;
		if (!container) return;

		let prevMid = { x: 0, y: 0 };
		let prevDist = 0;
		let isGestureActive = false;

		const handleTouchStart = (e: TouchEvent) => {
			if (e.touches.length !== 2) return;
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

	return (
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
				{/* Camera group — all content is transformed by the camera */}
				<g ref={cameraGroupRef} transform={cameraTransform}>
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
