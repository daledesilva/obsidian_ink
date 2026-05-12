import './tldraw-drawing-editor.scss';
import { Box, DefaultSizeStyle, Editor, TLUiOverrides, TldrawEditor, TldrawHandles, TldrawOptions, TldrawScribble, TldrawSelectionBackground, TldrawSelectionForeground, TldrawShapeIndicators, Vec, defaultShapeTools, defaultShapeUtils, defaultTools, getSnapshot, TLEditorSnapshot, TLEventInfo } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, adaptTldrawToObsidianThemeMode, focusChildTldrawEditor, getActivityType, getDrawingSvg, prepareDrawingSnapshot, preventTldrawCanvasesCausingObsidianGestures } from "src/components/formats/v1-code-blocks/utils/tldraw-helpers";
import { lockTldrawInput, unlockTldrawInput, bypassReadonly, startCameraSettleRaf, startCameraResizeObserver, initDrawingCamera } from "src/components/formats/current/utils/tldraw-helpers";
import * as React from "react";
import { Notice, TFile } from 'obsidian';
import { InkFileData } from 'src/components/formats/current/types/file-data';
import { buildDrawingFileData } from 'src/components/formats/current/utils/build-file-data';
import { DRAW_SHORT_DELAY_MS, DRAW_LONG_DELAY_MS } from 'src/constants';
import { PrimaryMenuBar } from 'src/components/jsx-components/primary-menu-bar/primary-menu-bar';
import DrawingMenu from 'src/components/jsx-components/drawing-menu/drawing-menu';
import ExtendedDrawingMenu from 'src/components/jsx-components/extended-drawing-menu/extended-drawing-menu';
import classNames from 'classnames';
import { useAtomValue } from 'jotai';
import { getInkFileData } from 'src/components/formats/v1-code-blocks/utils/getInkFileData';
import { ResizeHandle } from 'src/components/jsx-components/resize-handle/resize-handle';
import { debug, info, postAgentDebugIngest, verbose, warn } from 'src/logic/utils/universal-dev-logging';
import { logToVault } from 'src/logic/utils/log-to-vault';
import { getGlobals } from 'src/stores/global-store';
import { SecondaryMenuBar } from 'src/tldraw/secondary-menu-bar/secondary-menu-bar';
import ModifyMenu from 'src/tldraw/modify-menu/modify-menu';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { embedsInEditModeAtom_v2 } from '../drawing-embed/drawing-embed';
import { FingerBlocker } from 'src/components/jsx-components/finger-blocker/finger-blocker';
import { syncUnifiedUndoHistory, initialize } from 'src/logic/undo-redo/unified-undo-stack';
import { getRegisteredEmbedCountForLeaf, register as registerInkEditor, unregister as unregisterInkEditor } from 'src/logic/undo-redo/ink-editor-registry';
import { registerDedicatedInkEditor, unregisterDedicatedInkEditor } from 'src/logic/undo-redo/dedicated-ink-editor-registry';
import { getObsidianUndoDepthForLeaf } from 'src/logic/undo-redo/obsidian-undo-depth';
import { getTldrawNumUndos } from 'src/logic/undo-redo/tldraw-undo-depth';

/** Boox stroke payload in canvas-relative coordinates */
interface CanvasRelativeStrokePoint {
	pressure: number;
	size: number;
	tiltX: number;
	tiltY: number;
	timestamp: number;
	x: number;
	y: number;
}

const AGENT_DEBUG_RUN_ID = 'boox-vertical-y';

function agentDrawingBridgeLog(
	hypothesisId: string,
	location: string,
	message: string,
	data: Record<string, unknown>,
): void {
	console.log('[InkBridgeDebug]', message, data);
	// #region agent log
	postAgentDebugIngest({ hypothesisId, location, message, data, runId: AGENT_DEBUG_RUN_ID });
	// #endregion
}

///////
///////

interface TldrawDrawingEditor_Props {
    onReady?: Function,
	/** Owning workspace leaf; empty string if unresolved (embed unified undo skipped). */
	workspaceLeafId: string,
	embedId?: string,
	drawingFile: TFile,
	save: (pageData: InkFileData) => void,
	extendedMenu?: any[]

	// For embeds
	embedded?: boolean,
	resizeEmbed?: (pxWidthDiff: number, pxHeightDiff: number) => void,
	onResizeStart?: () => void,
	onResizeEnd?: () => void,
	applyEmbedDimensions?: (width: number, aspectRatio: number) => void,
	closeEditor?: Function,
	saveControlsReference?: Function,
	onOpenInDedicatedView?: Function,
}

// Wraps the component so that it can full unmount when inactive
export const TldrawDrawingEditorWrapper: React.FC<TldrawDrawingEditor_Props> = (props) => {
    const embedsInEditMode = useAtomValue(embedsInEditModeAtom_v2);
    const editorActive = !!props.embedId && embedsInEditMode.has(props.embedId);

    if(editorActive) {
        return <TldrawDrawingEditor {...props} />
    } else {
        return <></>
    }
}

const myOverrides: TLUiOverrides = {}

const tlOptions: Partial<TldrawOptions> = {
	defaultSvgPadding: 10, // Slight amount to prevent cropping overflows from stroke thickness
}

export function TldrawDrawingEditor(props: TldrawDrawingEditor_Props) {
	
	const [tlEditorSnapshot, setTlEditorSnapshot] = React.useState<TLEditorSnapshot>()
	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const tlEditorRef = useRef<Editor>();
	const editorWrapperRefEl = useRef<HTMLDivElement>(null);
	const adjustThrottleRef = useRef<NodeJS.Timeout | null>(null);
	const websocketConnectedRef = useRef(false);
	// Tracks whether the host view is currently the active leaf. False while the view is
	// hidden (e.g. user navigated back); prevents stale adjustment sends reaching the Bridge.
	const isViewActiveRef = useRef(true);
	// Minimal async boundary: ensures the synchronous close-drawing-area from the departing
	// view is always enqueued before we send new-drawing-area. setTimeout(fn, 0) is sufficient
	// since both active-leaf-change listeners fire in the same tick — any macrotask delay wins.
	const setBooxOverlayActiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Set when overlay creation was attempted but getBoundingClientRect() returned zero dims
	// (DOM still laying out). The ResizeObserver callback retries once dims are non-zero.
	const pendingNewOverlayRef = useRef<boolean>(false);
	// Holds the activate() fn returned by registerDrawingSession. Called when this session
	// becomes the active leaf so it moves to last in the session array and receives strokes.
	const activateDrawingSessionRef = useRef<(() => void) | null>(null);
	// Holds pan/zoom listener cleanup fns. Populated in handleMount; also referenced by
	// the safety-net useEffect so cleanup is guaranteed even if tldraw's onMount return
	// is never called (e.g. due to exceptions or future tldraw API changes).
	const panZoomCleanupFnsRef = useRef<Array<() => void>>([]);

	// For testing on laptop only
	// React.useEffect(() => {
	// 	if (editorWrapperRefEl.current) {
	// 		setUpNewDrawingAreaThroughWebSocket();
	// 	}
	// }, [tlEditorSnapshot]);

	// On mount
	React.useEffect( ()=> {
		verbose('EDITOR mounted');
		logToVault('Drawing editor mounted: ' + props.drawingFile.path + (props.embedded ? ' [embed]' : ' [dedicated]'));
		fetchFileData();
		return () => {
			verbose('EDITOR unmounting');
			logToVault('Drawing editor unmounted: ' + props.drawingFile.path);
			removeCanvasDebugOverlays();
		}
	}, [])

	// Boox companion app: one WebSocket per plugin session; register only while this drawing is active.
	const booxEffectRunCountRef = React.useRef(0);
	const prevSnapshotRefRef = React.useRef<unknown>(null);
	React.useEffect(() => {
		booxEffectRunCountRef.current += 1;
		const runCount = booxEffectRunCountRef.current;
		const snapshotRef = tlEditorSnapshot;
		const isNewRef = snapshotRef !== prevSnapshotRefRef.current;
		const wasNull = prevSnapshotRefRef.current === null;
		prevSnapshotRefRef.current = snapshotRef;
		agentDrawingBridgeLog('CONN', 'tldraw-drawing-editor.tsx:booxEffect', 'Boox useEffect fired', { hasSnapshot: !!tlEditorSnapshot, isNewObjectRef: isNewRef, wasNullBefore: wasNull, runCount, embedded: !!props.embedded, file: props.drawingFile.path });
		if (!tlEditorSnapshot) return;
		const inkPlugin = getGlobals().plugin;
		agentDrawingBridgeLog('CONN', 'tldraw-drawing-editor.tsx:booxEffect', 'Snapshot present — checking booxConnectionEnabled', { booxConnectionEnabled: inkPlugin.settings.booxConnectionEnabled, embedded: !!props.embedded, file: props.drawingFile.path });
		if (!inkPlugin.settings.booxConnectionEnabled) return;

		const { unregister, activate } = inkPlugin.booxConnection.registerDrawingSession({
			onStroke: (strokeData: unknown) => {
				const payload = strokeData as {
					strokeId?: number;
					points?: CanvasRelativeStrokePoint[];
					canvasWidth?: number;
					canvasHeight?: number;
				};
				const points = payload.points ?? (strokeData as CanvasRelativeStrokePoint[]);
				if (createStrokeFromBoox(points, payload) && payload.strokeId !== undefined) {
					inkPlugin.booxConnection.sendStrokeRendered(payload.strokeId);
				}
			},
			onSocketOpen: () => {
				agentDrawingBridgeLog('A,C', 'tldraw-drawing-editor.tsx:onSocketOpen', 'Boox drawing socket opened for active editor', {
					wasWebsocketConnectedRef: websocketConnectedRef.current,
					hasTlEditor: !!tlEditorRef.current,
					file: props.drawingFile.path,
					embedded: !!props.embedded,
				});
				websocketConnectedRef.current = true;
				if (tlEditorRef.current) lockTldrawInput(tlEditorRef.current);
				debug('Connected to Boox companion app WebSocket');
				new Notice('Connected to Boox companion app');
				newAndroidDrawingArea();
				const inkPlugin = getGlobals().plugin;
				if (tlEditorRef.current) inkPlugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(tlEditorRef.current));
			},
			onReactivate: () => {
				if (!websocketConnectedRef.current) return;
				// Use setTimeout(fn, 0) as a minimal async boundary — ensures any synchronous
				// close-drawing-area from a departing session is enqueued before we open a new one.
				if (setBooxOverlayActiveTimerRef.current) clearTimeout(setBooxOverlayActiveTimerRef.current);
				setBooxOverlayActiveTimerRef.current = setTimeout(() => {
					setBooxOverlayActiveTimerRef.current = null;
					if (!websocketConnectedRef.current) return;
					activateDrawingSessionRef.current?.();
					const sent = newAndroidDrawingArea();
					if (sent) {
						pendingNewOverlayRef.current = false;
						const inkPlugin = getGlobals().plugin;
						if (tlEditorRef.current) inkPlugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(tlEditorRef.current));
					} else {
						// Dims were zero — DOM still laying out. ResizeObserver will retry.
						pendingNewOverlayRef.current = true;
					}
				}, 0);
			},
		});
		activateDrawingSessionRef.current = activate;

		return () => {
			agentDrawingBridgeLog('A,C', 'tldraw-drawing-editor.tsx:drawingSessionCleanup', 'Boox drawing session cleanup is closing overlay', {
				wasWebsocketConnectedRef: websocketConnectedRef.current,
				isBooxConnected: inkPlugin.booxConnection.isConnected(),
				booxEffectRunCount: booxEffectRunCountRef.current,
				file: props.drawingFile.path,
				embedded: !!props.embedded,
			});
			websocketConnectedRef.current = false;
			pendingNewOverlayRef.current = false;
			if (tlEditorRef.current) unlockTldrawInput(tlEditorRef.current);
			if (adjustThrottleRef.current) clearTimeout(adjustThrottleRef.current);
			if (setBooxOverlayActiveTimerRef.current) clearTimeout(setBooxOverlayActiveTimerRef.current);
			activateDrawingSessionRef.current = null;
			// Don't call sendCloseDrawingArea here — the unregister callback in
			// BooxConnection handles it once the last session unregisters, so we
			// don't accidentally close the Bridge overlay that another active session
			// (e.g. a view opening while this embed is still closing) just opened.
			unregister();
		};
	}, [tlEditorSnapshot])

	// Adjust drawing area on page scroll
	React.useEffect(() => {
		if (!tlEditorSnapshot) return;
		if (!editorWrapperRefEl.current) return;

		const scrollEl = editorWrapperRefEl.current.closest('.cm-scroller');
		if (!scrollEl) return;

		const handleScroll = () => {
			adjustAndroidDrawingArea();
		};

		scrollEl.addEventListener('scroll', handleScroll);

		return () => {
			scrollEl.removeEventListener('scroll', handleScroll);
		};
	}, [tlEditorSnapshot])

	// Adjust drawing area on embed resize. Also retries pending overlay creation if dims
	// were zero when setBooxOverlayActive(true) or onReactivate fired.
	React.useEffect(() => {
		if (!tlEditorSnapshot) return;
		if (!editorWrapperRefEl.current) return;

		const resizeObserver = new ResizeObserver(() => {
			const editor = tlEditorRef.current;
			if (editor) {
				const cr = editor.getContainer().getBoundingClientRect();
				editor.updateViewportScreenBounds(
					new Box(cr.left, cr.top, Math.max(cr.width, 1), Math.max(cr.height, 1)),
				);
			}
			// If overlay creation is pending (dims were zero at timer-fire time), retry now.
			if (pendingNewOverlayRef.current && isViewActiveRef.current && websocketConnectedRef.current) {
				const sent = newAndroidDrawingArea();
				if (sent) {
					pendingNewOverlayRef.current = false;
					const inkPlugin = getGlobals().plugin;
					if (tlEditorRef.current) inkPlugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(tlEditorRef.current));
					return; // new-drawing-area already carries position; skip the adjust send
				}
				// Still zero — leave flag set, next ResizeObserver tick will retry
				return;
			}
			adjustAndroidDrawingArea();
		});

		resizeObserver.observe(editorWrapperRefEl.current);

		return () => {
			resizeObserver.disconnect();
		};
	}, [tlEditorSnapshot])

	// Safety-net: guarantee all pan/zoom event listeners are removed when this component
	// unmounts, regardless of whether tldraw calls the handleMount return value. React's
	// own lifecycle is far more reliable than a third-party callback, so this is the
	// primary guard against listeners surviving note navigation or plugin/tldraw updates.
	React.useEffect(() => {
		return () => {
			panZoomCleanupFnsRef.current.forEach(fn => fn());
			panZoomCleanupFnsRef.current = [];
		};
	}, []);

	if(!tlEditorSnapshot) return <></>
	verbose('EDITOR snapshot loaded')

	const defaultComponents = {
		Scribble: TldrawScribble,
		ShapeIndicators: TldrawShapeIndicators,
		CollaboratorScribble: TldrawScribble,
		SelectionForeground: TldrawSelectionForeground,
		SelectionBackground: TldrawSelectionBackground,
		Handles: TldrawHandles,
	}

	const handleMount = (_editor: Editor) => {
		const editor = tlEditorRef.current = _editor;
		agentDrawingBridgeLog('CONN', 'tldraw-drawing-editor.tsx:handleMount', 'tldraw mounted', { embedded: !!props.embedded, file: props.drawingFile.path, websocketConnectedRef: websocketConnectedRef.current });
		const leafId = props.workspaceLeafId;
		if (!props.embedded && leafId) {
			registerDedicatedInkEditor(leafId, editor);
		}
		focusChildTldrawEditor(editorWrapperRefEl.current);
		preventTldrawCanvasesCausingObsidianGestures(editor);

		// If Boox is already connected (session registered before tldraw mounted),
		// lock tldraw input now since onSocketOpen fired before tlEditorRef was set.
		// Also activate this session so it becomes last in drawingSessions — this ensures
		// strokes are routed here rather than to a zombie session that registered after us
		// but whose tldraw editor has already unmounted.
		const inkPlugin = getGlobals().plugin;
		const isAlreadyConnected = inkPlugin.settings.booxConnectionEnabled && inkPlugin.booxConnection.isConnected();
		agentDrawingBridgeLog('CONN', 'tldraw-drawing-editor.tsx:handleMount', 'Checking if Boox already connected at mount time', { booxConnectionEnabled: inkPlugin.settings.booxConnectionEnabled, isConnected: inkPlugin.booxConnection.isConnected(), willLockInput: isAlreadyConnected, embedded: !!props.embedded });
		if (isAlreadyConnected) {
			lockTldrawInput(editor);
			activateDrawingSessionRef.current?.();
		}

		// Dedicated view: WebSocket often opens before tldraw mounts, so the first
		// new-drawing-area used the wrapper rect. Push an update using `.tl-canvas` now.
		if (isAlreadyConnected && !props.embedded && inkPlugin.settings.booxConnectionEnabled && websocketConnectedRef.current) {
			requestAnimationFrame(() => {
				if (!websocketConnectedRef.current) return;
				const ink = getGlobals().plugin;
				if (!ink.settings.booxConnectionEnabled) return;
				const ed = tlEditorRef.current;
				if (ed) syncDrawingViewportScreenBoundsFromContainer(ed);
				const surfacePayload = buildBooxDrawingAreaPayload();
				if (!surfacePayload) return;
				ink.booxConnection.sendUpdateDrawingArea(surfacePayload);
				agentDrawingBridgeLog('B,C', 'tldraw-drawing-editor.tsx:handleMount', 'Dedicated post-mount Boox drawing area sync', {
					...surfacePayload,
					file: props.drawingFile.path,
				});
			});
		}

		// Pan/zoom event listener cleanup functions
		const panZoomCleanupFns: Array<() => void> = [];

		// Dedicated-view pan/zoom listeners
		if (!props.embedded) {
			const wrapperEl = editorWrapperRefEl.current;
			const tlContainer = editor.getContainer();

			// Mod+wheel zoom — continuous setCamera for fine-grained control
			const WHEEL_ZOOM_FACTOR = 0.08; // 8% per scroll notch
			if (wrapperEl) {
				const wheelHandler = (e: WheelEvent) => {
					if (e.metaKey || e.ctrlKey) {
						e.preventDefault();
						e.stopPropagation();
						const containerRect = tlContainer.getBoundingClientRect();
						const sx = e.clientX - containerRect.left;
						const sy = e.clientY - containerRect.top;
						const { x: cx, y: cy, z: cz } = editor.getCamera();
						const { zoomSteps } = editor.getCameraOptions();
						const factor = e.deltaY < 0 ? (1 + WHEEL_ZOOM_FACTOR) : (1 / (1 + WHEEL_ZOOM_FACTOR));
						const newZ = Math.max(zoomSteps[0], Math.min(zoomSteps[zoomSteps.length - 1], cz * factor));
						// tldraw transform: viewportX = (pageX + cx) * cz
						// To keep viewport point (sx, sy) fixed: newCx = cx + sx * (1/newZ - 1/cz)
						console.log('[drawing pan/zoom] Mod+wheel zoom', { direction: e.deltaY < 0 ? 'in' : 'out', newZ });
						editor.setCamera({ x: cx + sx * (1 / newZ - 1 / cz), y: cy + sy * (1 / newZ - 1 / cz), z: newZ }, { animation: { duration: 0 } });
					} else {
						// Plain wheel: prevent page scroll, let tldraw handle panning naturally.
						console.log('[drawing pan/zoom] plain wheel — preventing page scroll, tldraw pans', { deltaX: e.deltaX, deltaY: e.deltaY });
						e.preventDefault();
					}
				};
				wrapperEl.addEventListener('wheel', wheelHandler, { capture: true, passive: false });
				panZoomCleanupFns.push(() => wrapperEl.removeEventListener('wheel', wheelHandler, { capture: true }));
			}

			// Space+drag panning: implemented manually via setCamera rather than the hand
			// tool, because the hand tool needs a pointerdown routed through its own state
			// machine to begin dragging, which doesn't happen when we switch to it mid-gesture.
			//
			// Guard: cursor must be over the editor wrapper (hover check), NOT a focus check.
			// Focus is unreliable — any click elsewhere in Obsidian moves focus to BODY with
			// no reliable way to restore it before the next keydown.
			//
			// Pointer events are tracked by pointerId so they are always cleanly paired:
			// if we stopPropagation on pointerdown, we MUST also stopPropagation on pointermove
			// and pointerup for that same pointer — otherwise tldraw receives an orphaned
			// pointerup and its internal state breaks for subsequent interactions.
			const isSpaceHeld = { current: false };
			const isPointerOverEditor = { current: false };
			let panPointerId: number | null = null;
			const lastSpacePanPoint = { current: { x: 0, y: 0 } };

			// Track hover so Space only activates when cursor is over the editor
			const editorMouseEnterHandler = () => { isPointerOverEditor.current = true; };
			const editorMouseLeaveHandler = () => { isPointerOverEditor.current = false; };
			if (wrapperEl) {
				wrapperEl.addEventListener('mouseenter', editorMouseEnterHandler);
				wrapperEl.addEventListener('mouseleave', editorMouseLeaveHandler);
				panZoomCleanupFns.push(() => {
					wrapperEl.removeEventListener('mouseenter', editorMouseEnterHandler);
					wrapperEl.removeEventListener('mouseleave', editorMouseLeaveHandler);
				});
			}

			const spaceKeyDownHandler = (e: KeyboardEvent) => {
				if (e.key !== ' ' || e.metaKey || e.ctrlKey || e.repeat) return;
				if (!isPointerOverEditor.current) {
					console.log('[drawing pan/zoom] Space pressed but cursor not over editor — ignoring');
					return;
				}
				isSpaceHeld.current = true;
				tlContainer.style.cursor = 'grab';
				e.preventDefault();
				console.log('[drawing pan/zoom] Space held — ready to pan');
			};
			const spaceKeyUpHandler = (e: KeyboardEvent) => {
				if (e.key !== ' ') return;
				isSpaceHeld.current = false;
				if (panPointerId === null) {
					tlContainer.style.cursor = '';
				}
				// Don't clear panPointerId here — let pointerup handle cleanup so we always
				// stopPropagation the paired pointerup even if Space is released before mouse.
				console.log('[drawing pan/zoom] Space released');
			};
			const spacePointerDownHandler = (e: PointerEvent) => {
				if (!isSpaceHeld.current || e.button !== 0) return;
				panPointerId = e.pointerId;
				lastSpacePanPoint.current = { x: e.clientX, y: e.clientY };
				tlContainer.setPointerCapture(e.pointerId);
				tlContainer.style.cursor = 'grabbing';
				e.preventDefault();
				e.stopPropagation(); // prevent tldraw from starting a draw stroke
				console.log('[drawing pan/zoom] Space+pointer down — pan started at', { x: e.clientX, y: e.clientY });
			};
			const spacePointerMoveHandler = (e: PointerEvent) => {
				if (e.pointerId !== panPointerId) return;
				const dx = e.clientX - lastSpacePanPoint.current.x;
				const dy = e.clientY - lastSpacePanPoint.current.y;
				lastSpacePanPoint.current = { x: e.clientX, y: e.clientY };
				const { x: cx, y: cy, z: cz } = editor.getCamera();
				// Camera x/y are in page-space; divide screen-pixel delta by zoom to keep
				// pan speed consistent regardless of zoom level.
				editor.setCamera({ x: cx + dx / cz, y: cy + dy / cz, z: cz });
				e.preventDefault();
				e.stopPropagation();
			};
			const spacePointerUpHandler = (e: PointerEvent) => {
				if (e.pointerId !== panPointerId) return;
				panPointerId = null;
				tlContainer.style.cursor = isSpaceHeld.current ? 'grab' : '';
				e.preventDefault();
				e.stopPropagation(); // must match — tldraw never saw the pointerdown, so it must not see the pointerup
				console.log('[drawing pan/zoom] Space+pointer up — pan ended');
			};

			document.addEventListener('keydown', spaceKeyDownHandler, true);
			document.addEventListener('keyup', spaceKeyUpHandler, true);
			tlContainer.addEventListener('pointerdown', spacePointerDownHandler, true);
			tlContainer.addEventListener('pointermove', spacePointerMoveHandler, true);
			tlContainer.addEventListener('pointerup', spacePointerUpHandler, true);
			panZoomCleanupFns.push(() => {
				document.removeEventListener('keydown', spaceKeyDownHandler, true);
				document.removeEventListener('keyup', spaceKeyUpHandler, true);
				tlContainer.removeEventListener('pointerdown', spacePointerDownHandler, true);
				tlContainer.removeEventListener('pointermove', spacePointerMoveHandler, true);
				tlContainer.removeEventListener('pointerup', spacePointerUpHandler, true);
			});

			// Right-mouse-button drag-to-zoom — continuous setCamera for smooth control.
			// Up or right = zoom in; down or left = zoom out.
			// Uses the dominant axis (whichever has the larger absolute delta), not the sum.
			const DRAG_ZOOM_FACTOR_PER_PX = 0.015; // 1.5% zoom per pixel of dominant-axis movement
			let dragZoomPointerId: number | null = null;
			let dragZoomStartPoint = { x: 0, y: 0 };
			let dragZoomLastPoint = { x: 0, y: 0 };

			const dragZoomPointerDownHandler = (e: PointerEvent) => {
				if (e.button !== 2) return; // right button only
				dragZoomPointerId = e.pointerId;
				dragZoomStartPoint = { x: e.clientX, y: e.clientY };
				dragZoomLastPoint = { x: e.clientX, y: e.clientY };
				tlContainer.setPointerCapture(e.pointerId);
				tlContainer.style.cursor = 'ns-resize';
				e.preventDefault();
				e.stopPropagation();
				console.log('[drawing pan/zoom] Right-drag zoom started at', { x: e.clientX, y: e.clientY });
			};
			const dragZoomPointerMoveHandler = (e: PointerEvent) => {
				if (e.pointerId !== dragZoomPointerId) return;
				const dx = e.clientX - dragZoomLastPoint.x;
				const dy = e.clientY - dragZoomLastPoint.y;
				dragZoomLastPoint = { x: e.clientX, y: e.clientY };

				// Dominant axis wins: right/up = zoom in, left/down = zoom out.
				const dominantDelta = Math.abs(dx) >= Math.abs(dy) ? dx : -dy;
				if (dominantDelta !== 0) {
					const { x: cx, y: cy, z: cz } = editor.getCamera();
					const { zoomSteps } = editor.getCameraOptions();
					const factor = Math.pow(1 + DRAG_ZOOM_FACTOR_PER_PX, dominantDelta);
					const newZ = Math.max(zoomSteps[0], Math.min(zoomSteps[zoomSteps.length - 1], cz * factor));
					const containerRect = tlContainer.getBoundingClientRect();
					const sx = dragZoomStartPoint.x - containerRect.left;
					const sy = dragZoomStartPoint.y - containerRect.top;
					// tldraw transform: viewportX = (pageX + cx) * cz
					// To keep viewport point (sx, sy) fixed: newCx = cx + sx * (1/newZ - 1/cz)
					editor.setCamera({ x: cx + sx * (1 / newZ - 1 / cz), y: cy + sy * (1 / newZ - 1 / cz), z: newZ }, { animation: { duration: 0 } });
				}

				e.preventDefault();
				e.stopPropagation();
			};
			const dragZoomPointerUpHandler = (e: PointerEvent) => {
				if (e.pointerId !== dragZoomPointerId) return;
				dragZoomPointerId = null;
				tlContainer.style.cursor = isSpaceHeld.current ? 'grab' : '';
				e.preventDefault();
				e.stopPropagation();
				console.log('[drawing pan/zoom] Right-drag zoom ended');
			};
			// Suppress the context menu only if the pointer actually moved (drag, not tap)
			const contextMenuSuppressHandler = (e: MouseEvent) => {
				if (dragZoomStartPoint.x !== e.clientX || dragZoomStartPoint.y !== e.clientY) {
					e.preventDefault();
				}
			};

			tlContainer.addEventListener('pointerdown', dragZoomPointerDownHandler, true);
			tlContainer.addEventListener('pointermove', dragZoomPointerMoveHandler, true);
			tlContainer.addEventListener('pointerup', dragZoomPointerUpHandler, true);
			tlContainer.addEventListener('contextmenu', contextMenuSuppressHandler, true);
			panZoomCleanupFns.push(() => {
				tlContainer.removeEventListener('pointerdown', dragZoomPointerDownHandler, true);
				tlContainer.removeEventListener('pointermove', dragZoomPointerMoveHandler, true);
				tlContainer.removeEventListener('pointerup', dragZoomPointerUpHandler, true);
				tlContainer.removeEventListener('contextmenu', contextMenuSuppressHandler, true);
			});
		}

		// Embed mouse pan/zoom: middle-mouse drag to pan, mod+scroll zoom, right-drag zoom.
		// Camera is locked by default in embeds; we unlock only for the duration of each gesture.
		if (props.embedded) {
			const tlContainer = editor.getContainer();
			const wrapperEl = editorWrapperRefEl.current;

			const EMBED_WHEEL_ZOOM_FACTOR = 0.08;
			const EMBED_DRAG_ZOOM_FACTOR_PER_PX = 0.015;

			// Restores the Obsidian note scroll container after FingerBlocker locks it.
			// FingerBlocker locks on any mouse/pen pointerdown but never receives our
			// gesture's pointerup (because we transfer pointer capture to tlContainer).
			// We must mirror FingerBlocker's unlockScroll() exactly so state stays consistent.
			const cmScroller = wrapperEl?.closest<HTMLElement>('.cm-scroller') ?? null;
			const restoreEmbedScroll = () => {
				if (!cmScroller) return;
				cmScroller.style.overflow = 'auto';
				// scrollbarColor is set transparent by FingerBlocker; restore after same
				// delay it uses so the transition matches.
				setTimeout(() => {
					cmScroller.style.scrollbarColor = 'auto';
				}, 200);
			};
			let wheelScrollRestoreTimer: ReturnType<typeof setTimeout> | null = null;

			const embedZoomAroundPoint = (sx: number, sy: number, newZ: number) => {
				const { x: cx, y: cy, z: cz } = editor.getCamera();
				editor.setCamera({ x: cx + sx * (1 / newZ - 1 / cz), y: cy + sy * (1 / newZ - 1 / cz), z: newZ }, { animation: { duration: 0 } });
			};
			const embedClampedZoom = (cz: number, factor: number) => {
				const { zoomSteps } = editor.getCameraOptions();
				return Math.max(zoomSteps[0], Math.min(zoomSteps[zoomSteps.length - 1], cz * factor));
			};

			// ── Mod+scroll zoom ──────────────────────────────────────────────────
			if (wrapperEl) {
				const embedWheelHandler = (e: WheelEvent) => {
					if (!(e.metaKey || e.ctrlKey)) return;
					e.preventDefault();
					// Do NOT call stopPropagation on wheel events. On macOS, interrupting a
					// trackpad gesture sequence with stopPropagation corrupts the native OS
					// gesture recogniser state for the entire Electron session — permanently
					// breaking scroll until the window is closed. preventDefault alone is
					// sufficient to block the browser-level zoom action.
					const containerRect = tlContainer.getBoundingClientRect();
					const sx = e.clientX - containerRect.left;
					const sy = e.clientY - containerRect.top;
					const { z: cz } = editor.getCamera();
					const factor = e.deltaY < 0 ? (1 + EMBED_WHEEL_ZOOM_FACTOR) : (1 / (1 + EMBED_WHEEL_ZOOM_FACTOR));
					const newZ = embedClampedZoom(cz, factor);
					console.log('[drawing pan/zoom] embed: mod+wheel zoom', { direction: e.deltaY < 0 ? 'in' : 'out', newZ });
					editor.setCameraOptions({ isLocked: false });
					embedZoomAroundPoint(sx, sy, newZ);
					editor.setCameraOptions({ isLocked: true });
					// Restore scroll after a brief idle — wheel events have no end event.
					if (wheelScrollRestoreTimer !== null) clearTimeout(wheelScrollRestoreTimer);
					wheelScrollRestoreTimer = setTimeout(() => {
						wheelScrollRestoreTimer = null;
						restoreEmbedScroll();
					}, 150);
				};
				wrapperEl.addEventListener('wheel', embedWheelHandler, { capture: true, passive: false });
				panZoomCleanupFns.push(() => wrapperEl.removeEventListener('wheel', embedWheelHandler, { capture: true }));
			}

			// ── Middle-mouse-button drag to pan ──────────────────────────────────
			let midPanPointerId: number | null = null;
			let lastMidPanPoint = { x: 0, y: 0 };

			const midPanPointerDownHandler = (e: PointerEvent) => {
				if (e.button !== 1) return;
				midPanPointerId = e.pointerId;
				lastMidPanPoint = { x: e.clientX, y: e.clientY };
				tlContainer.setPointerCapture(e.pointerId);
				tlContainer.style.cursor = 'grabbing';
				e.preventDefault();
				e.stopPropagation();
				console.log('[drawing pan/zoom] embed: mid-button pan started');
			};
			const midPanPointerMoveHandler = (e: PointerEvent) => {
				if (e.pointerId !== midPanPointerId) return;
				const dx = e.clientX - lastMidPanPoint.x;
				const dy = e.clientY - lastMidPanPoint.y;
				lastMidPanPoint = { x: e.clientX, y: e.clientY };
				const { x: cx, y: cy, z: cz } = editor.getCamera();
				editor.setCameraOptions({ isLocked: false });
				editor.setCamera({ x: cx + dx / cz, y: cy + dy / cz, z: cz });
				editor.setCameraOptions({ isLocked: true });
				e.preventDefault();
				e.stopPropagation();
			};
			const midPanPointerUpHandler = (e: PointerEvent) => {
				if (e.pointerId !== midPanPointerId) return;
				midPanPointerId = null;
				tlContainer.style.cursor = '';
				restoreEmbedScroll();
				e.preventDefault();
				e.stopPropagation();
				console.log('[drawing pan/zoom] embed: mid-button pan ended');
			};
			tlContainer.addEventListener('pointerdown', midPanPointerDownHandler, true);
			tlContainer.addEventListener('pointermove', midPanPointerMoveHandler, true);
			tlContainer.addEventListener('pointerup', midPanPointerUpHandler, true);
			panZoomCleanupFns.push(() => {
				tlContainer.removeEventListener('pointerdown', midPanPointerDownHandler, true);
				tlContainer.removeEventListener('pointermove', midPanPointerMoveHandler, true);
				tlContainer.removeEventListener('pointerup', midPanPointerUpHandler, true);
			});

			// ── Right-mouse-button drag-to-zoom ──────────────────────────────────
			let embedDragZoomPointerId: number | null = null;
			let embedDragZoomStartPoint = { x: 0, y: 0 };
			let embedDragZoomLastPoint = { x: 0, y: 0 };

			const embedDragZoomPointerDownHandler = (e: PointerEvent) => {
				if (e.button !== 2) return;
				embedDragZoomPointerId = e.pointerId;
				embedDragZoomStartPoint = { x: e.clientX, y: e.clientY };
				embedDragZoomLastPoint = { x: e.clientX, y: e.clientY };
				tlContainer.setPointerCapture(e.pointerId);
				tlContainer.style.cursor = 'ns-resize';
				e.preventDefault();
				e.stopPropagation();
				console.log('[drawing pan/zoom] embed: right-drag zoom started');
			};
			const embedDragZoomPointerMoveHandler = (e: PointerEvent) => {
				if (e.pointerId !== embedDragZoomPointerId) return;
				const dx = e.clientX - embedDragZoomLastPoint.x;
				const dy = e.clientY - embedDragZoomLastPoint.y;
				embedDragZoomLastPoint = { x: e.clientX, y: e.clientY };
				const dominantDelta = Math.abs(dx) >= Math.abs(dy) ? dx : -dy;
				if (dominantDelta !== 0) {
					const { z: cz } = editor.getCamera();
					const newZ = embedClampedZoom(cz, Math.pow(1 + EMBED_DRAG_ZOOM_FACTOR_PER_PX, dominantDelta));
					const containerRect = tlContainer.getBoundingClientRect();
					const sx = embedDragZoomStartPoint.x - containerRect.left;
					const sy = embedDragZoomStartPoint.y - containerRect.top;
					editor.setCameraOptions({ isLocked: false });
					embedZoomAroundPoint(sx, sy, newZ);
					editor.setCameraOptions({ isLocked: true });
				}
				e.preventDefault();
				e.stopPropagation();
			};
			const embedDragZoomPointerUpHandler = (e: PointerEvent) => {
				if (e.pointerId !== embedDragZoomPointerId) return;
				embedDragZoomPointerId = null;
				tlContainer.style.cursor = '';
				restoreEmbedScroll();
				e.preventDefault();
				e.stopPropagation();
				console.log('[drawing pan/zoom] embed: right-drag zoom ended');
			};
			const embedContextMenuSuppressHandler = (e: MouseEvent) => {
				if (embedDragZoomStartPoint.x !== e.clientX || embedDragZoomStartPoint.y !== e.clientY) {
					e.preventDefault();
				}
			};
			tlContainer.addEventListener('pointerdown', embedDragZoomPointerDownHandler, true);
			tlContainer.addEventListener('pointermove', embedDragZoomPointerMoveHandler, true);
			tlContainer.addEventListener('pointerup', embedDragZoomPointerUpHandler, true);
			tlContainer.addEventListener('contextmenu', embedContextMenuSuppressHandler, true);
			panZoomCleanupFns.push(() => {
				tlContainer.removeEventListener('pointerdown', embedDragZoomPointerDownHandler, true);
				tlContainer.removeEventListener('pointermove', embedDragZoomPointerMoveHandler, true);
				tlContainer.removeEventListener('pointerup', embedDragZoomPointerUpHandler, true);
				tlContainer.removeEventListener('contextmenu', embedContextMenuSuppressHandler, true);
			});
		}

		// tldraw content setup
		adaptTldrawToObsidianThemeMode(editor);
		editor.updateInstanceState({
			isGridMode: true,
		})
		
		// view setup
		initDrawingCamera(editor);
		syncDrawingViewportScreenBoundsFromContainer(editor);
		if (props.embedded) {
			editor.setCameraOptions({
				isLocked: true,
			})
			// Re-center on container resize (sidebar toggle, window resize, etc.).
			// Camera must be temporarily unlocked because isLocked blocks programmatic setCamera calls.
			panZoomCleanupFns.push(startCameraResizeObserver(editor, () => {
				editor.setCameraOptions({ isLocked: false });
				initDrawingCamera(editor);
				syncDrawingViewportScreenBoundsFromContainer(editor);
				editor.setCameraOptions({ isLocked: true });
			}));
		}

		// Re-fit camera on each animation frame until the canvas width stabilises after
		// the sidebar collapse animation completes.
		if (!props.embedded) {
			panZoomCleanupFns.push(startCameraSettleRaf(editor, () => {
				initDrawingCamera(editor);
				syncDrawingViewportScreenBoundsFromContainer(editor);
			}));
			// Re-center on ongoing container resizes (sidebar toggle, window resize, etc.).
			panZoomCleanupFns.push(startCameraResizeObserver(editor, () => {
				initDrawingCamera(editor);
				syncDrawingViewportScreenBoundsFromContainer(editor);
			}));
		}

		// Unified undo stack: when embedded, sync Obsidian and tldraw history on each user change (per leaf)
		if (props.embedded && props.embedId && leafId && editorWrapperRefEl.current) {
			const obsidianDepth = getObsidianUndoDepthForLeaf(getGlobals().plugin, leafId);
			const tldrawUndos = getTldrawNumUndos(editor);
			if (getRegisteredEmbedCountForLeaf(leafId) > 0) {
				initialize(leafId, obsidianDepth, tldrawUndos, undefined, { mergeWithExisting: true, embedId: props.embedId });
			} else {
				initialize(leafId, obsidianDepth, tldrawUndos);
			}
			registerInkEditor(props.embedId, editor, editorWrapperRefEl.current, leafId, props.applyEmbedDimensions);
		}

		// Make visible once prepared
		if(editorWrapperRefEl.current) {
			editorWrapperRefEl.current.style.opacity = '1';
			// Dedicated view: keep key events on the wrapper (tabIndex + keydown capture).
			// Embeds: avoid stealing focus from Obsidian / CodeMirror.
			if (!props.embedded) {
				// Focus the tldraw container so tldraw's own key handlers (e.g. space-to-pan) fire.
				// Our onKeyDownCapture on the wrapper still fires in capture phase for undo/redo.
				console.log('[drawing pan/zoom] dedicated: focusing tldraw container on mount');
				editor.getContainer().focus({ preventScroll: true });
			}
		}

		// Runs on any USER caused change to the store, (Anything wrapped in silently change method doesn't call this).
		const removeUserActionListener = editor.store.listen((entry) => {
			if (websocketConnectedRef.current) return;

			const activity = getActivityType(entry);
			if (activity === Activity.PointerMoved) {
				return;
			}

			switch (activity) {
				case Activity.CameraMovedAutomatically:
				case Activity.CameraMovedManually:
					break;

				case Activity.DrawingStarted:
					resetInputPostProcessTimers();
					break;

				case Activity.DrawingContinued:
					resetInputPostProcessTimers();
					break;

				case Activity.DrawingCompleted:
					if (props.embedded && props.embedId && leafId) {
						syncUnifiedUndoHistory(leafId, props.embedId, { maxTldrawDelta: 1 });
					}
					queueOrRunStorePostProcesses(editor);
					embedPostProcess(editor);
					break;

				case Activity.DrawingErased:
					if (props.embedded && props.embedId && leafId) {
						syncUnifiedUndoHistory(leafId, props.embedId, { maxTldrawDelta: 1 });
					}
					queueOrRunStorePostProcesses(editor);
					embedPostProcess(editor);	// REVIEW: This could go inside a post process
					break;

				default:
					// Catch anything else not specifically mentioned (ie. erase, draw shape, etc.)
					queueOrRunStorePostProcesses(editor);
					verbose('Activity not recognised.');
					verbose(['entry', entry], {freeze: true});
			}

		}, {
			source: 'user',	// Local changes
			scope: 'all'	// Filters some things like camera movement changes. But Not sure it's locked down enough, so leaving as all.
		})

		const unmountActions = () => {
			// NOTE: This prevents the postProcessTimer completing when a new file is open and saving over that file.
			resetInputPostProcessTimers();
			removeUserActionListener();
			panZoomCleanupFns.forEach(fn => fn());
			panZoomCleanupFnsRef.current = []; // Clear ref so the safety-net useEffect doesn't double-run
			if (props.embedded && props.embedId) {
				unregisterInkEditor(props.embedId);
			}
			if (!props.embedded && leafId) {
				unregisterDedicatedInkEditor(leafId, editor);
			}
		}

		if(props.saveControlsReference) {
			props.saveControlsReference({
				save: () => completeSave(editor),
				saveAndHalt: async (): Promise<void> => {
					await completeSave(editor)
					unmountActions();	// Clean up immediately so nothing else occurs between this completeSave and a future unmount
				},
				eraseAll: async (): Promise<void> => {
					const allShapeIds = [...editor.getCurrentPageShapeIds()];
					editor.deleteShapes(allShapeIds);
					await completeSave(editor);
				},
				setBooxOverlayActive: (isActive: boolean) => {
					isViewActiveRef.current = isActive;
					const inkPlugin2 = getGlobals().plugin;
					agentDrawingBridgeLog('A,C', 'tldraw-drawing-editor.tsx:setBooxOverlayActive', 'setBooxOverlayActive called', {
						isActive,
						websocketConnectedRef: websocketConnectedRef.current,
						activeSessions: inkPlugin2.booxConnection.getSessionCount?.(),
						embedded: !!props.embedded,
						file: props.drawingFile.path,
					});
					// Always cancel a pending re-open timer and clear the ResizeObserver retry flag
					// first — if we're deactivating, no open should happen; if reactivating, a
					// fresh timer below takes over.
					if (setBooxOverlayActiveTimerRef.current) clearTimeout(setBooxOverlayActiveTimerRef.current);
					setBooxOverlayActiveTimerRef.current = null;
					if (!isActive) pendingNewOverlayRef.current = false;
					if (!websocketConnectedRef.current) return;
					const inkPlugin = getGlobals().plugin;
					if (!inkPlugin.settings.booxConnectionEnabled) return;
					if (isActive) {
						// setTimeout(fn, 0): minimal async boundary so the synchronous
						// close-drawing-area from the departing view is always enqueued first.
						setBooxOverlayActiveTimerRef.current = setTimeout(() => {
							setBooxOverlayActiveTimerRef.current = null;
							if (!websocketConnectedRef.current) return;
							activateDrawingSessionRef.current?.();
							const sent = newAndroidDrawingArea();
							if (sent) {
								pendingNewOverlayRef.current = false;
								if (tlEditorRef.current) inkPlugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(tlEditorRef.current));
							} else {
								// Dims were zero — DOM still laying out. ResizeObserver will retry.
								pendingNewOverlayRef.current = true;
							}
						}, 0);
					} else {
						inkPlugin.booxConnection.sendCloseDrawingArea();
					}
				},
			})
		}
		
		if(props.onReady) props.onReady();

		// Expose to safety-net useEffect so cleanup runs even if this return is never called
		panZoomCleanupFnsRef.current = panZoomCleanupFns;

		return () => {
			unmountActions();
		};
	}

	// Helper functions
	///////////////////

    async function fetchFileData() {
		agentDrawingBridgeLog('CONN', 'tldraw-drawing-editor.tsx:fetchFileData', 'Reading drawing file', { file: props.drawingFile.path, embedded: !!props.embedded });
		const svg = await props.drawingFile.vault.read(props.drawingFile);
        if(svg) {
			const svgSettings = extractInkJsonFromSvg(svg);
			if(svgSettings) {
				const snapshot = prepareDrawingSnapshot(svgSettings.tldraw);
				agentDrawingBridgeLog('CONN', 'tldraw-drawing-editor.tsx:fetchFileData', 'Snapshot ready — calling setTlEditorSnapshot', { file: props.drawingFile.path, embedded: !!props.embedded });
				setTlEditorSnapshot(snapshot);
			} else {
				agentDrawingBridgeLog('CONN', 'tldraw-drawing-editor.tsx:fetchFileData', 'No ink JSON in file', { file: props.drawingFile.path });
				logToVault('Drawing file has no ink JSON: ' + props.drawingFile.path);
			}
        } else {
			agentDrawingBridgeLog('CONN', 'tldraw-drawing-editor.tsx:fetchFileData', 'File unreadable', { file: props.drawingFile.path });
			logToVault('Drawing file unreadable: ' + props.drawingFile.path);
		}
    }

	const embedPostProcess = (editor: Editor) => {
		// resizeContainerIfEmbed(editor);
	}

	const queueOrRunStorePostProcesses = (editor: Editor) => {
		instantInputPostProcess(editor);
		smallDelayInputPostProcess(editor);
		longDelayInputPostProcess(editor);
	}

	// Use this to run optimisations that that are quick and need to occur immediately on lifting the stylus
	const instantInputPostProcess = (editor: Editor) => { //, entry?: HistoryEntry<TLRecord>) => {
		// simplifyLines(editor, entry);
	};

	// Use this to run optimisations that take a small amount of time but should happen frequently
	const smallDelayInputPostProcess = (editor: Editor) => {
		resetShortPostProcessTimer();

		shortDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				incrementalSave(editor);
			},
			DRAW_SHORT_DELAY_MS
		)

	};

	// Use this to run optimisations after a slight delay
	const longDelayInputPostProcess = (editor: Editor) => {
		resetLongPostProcessTimer();

		longDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				completeSave(editor);
			},
			DRAW_LONG_DELAY_MS
		)

	};

	const resetShortPostProcessTimer = () => {
		clearTimeout(shortDelayPostProcessTimeoutRef.current);
	}
	const resetLongPostProcessTimer = () => {
		clearTimeout(longDelayPostProcessTimeoutRef.current);
	}
	const resetInputPostProcessTimers = () => {
		resetShortPostProcessTimer();
		resetLongPostProcessTimer();
	}

	const incrementalSave = async (editor: Editor) => {
		verbose('incrementalSave');
		logToVault('incrementalSave (drawing): ' + props.drawingFile.path);
		const tlEditorSnapshot = getSnapshot(editor.store);
		const svgObj = await getDrawingSvg(editor);
		const drawingFileData = buildDrawingFileData({
			tlEditorSnapshot: tlEditorSnapshot,
			svgString: svgObj?.svg,
		})
		props.save(drawingFileData);
	}

	const completeSave = async (editor: Editor): Promise<void> => {
		verbose('completeSave');
		logToVault('completeSave (drawing): ' + props.drawingFile.path);
		let svgString;

		const tlEditorSnapshot = getSnapshot(editor.store);
		const svgObj = await getDrawingSvg(editor);

		if(svgObj?.svg) {
			const pageData = buildDrawingFileData({
				tlEditorSnapshot,
				svgString: svgObj.svg,
			})
			props.save(pageData);
			// savePngExport(plugin, previewUri, props.fileRef)

		} else {
			const pageData = buildDrawingFileData({
				tlEditorSnapshot: tlEditorSnapshot,
			})
			props.save(pageData);
		}

		return;
	}

	const getTlEditor = (): Editor | undefined => {
		return tlEditorRef.current;
	};

	const customExtendedMenu = [
		{
			text: 'Grid on/off',
			action: () => {
				const editor = getTlEditor();
				if(editor) {
					editor.updateInstanceState({ isGridMode: !editor.getInstanceState().isGridMode })
				}
			}
		},
		...(props.extendedMenu || []),
	]

	//////////////

	return <>
		<div
			ref = {editorWrapperRefEl}
			className = {classNames([
				"ddc_ink_drawing-editor"
			])}
			style = {{
				height: '100%',
				position: 'relative',
				opacity: 0, // So it's invisible while it loads
			}}
			tabIndex={props.embedded ? undefined : 0}
			onKeyDownCapture={(e) => {
				if (props.embedded) return;
				const editor = tlEditorRef.current;
				if (!editor) return;

				const modKey = e.metaKey || e.ctrlKey;
				const key = (e.key ?? '').toLowerCase();

				// Undo: Mod+Z — stopPropagation so tldraw doesn't also handle it
				if (modKey && !e.shiftKey && key === 'z') {
					e.preventDefault();
					e.stopPropagation();
					editor.undo();
					return;
				}

				// Redo: Mod+Shift+Z or Mod+Y — stopPropagation so tldraw doesn't also handle it
				if (modKey && ((e.shiftKey && key === 'z') || key === 'y')) {
					e.preventDefault();
					e.stopPropagation();
					editor.redo();
					return;
				}
				// Space+drag pan is handled by native document-level listeners in handleMount.
			}}
			onPointerDown={() => {
				if (props.embedded) return;
				// Focus the tldraw container (not the wrapper) so tldraw's own key handlers fire.
				console.log('[drawing pan/zoom] dedicated: onPointerDown — re-focusing tldraw container');
				tlEditorRef.current?.getContainer().focus({ preventScroll: true });
			}}
		>
			<TldrawEditor
				options = {tlOptions}
				shapeUtils = {[...defaultShapeUtils]}
				tools = {[...defaultTools, ...defaultShapeTools]}
				initialState = "draw"
				snapshot = {tlEditorSnapshot}
				// persistenceKey = {props.fileRef.path}

				// bindingUtils = {defaultBindingUtils}
				components = {defaultComponents}

				onMount = {handleMount}

				// Prevent autoFocussing so it can be handled in the handleMount / wrapper focus.
				autoFocus = {false}
			/>
			<FingerBlocker
				getTlEditor={getTlEditor}
				wrapperRef={editorWrapperRefEl}
				enableTwoFingerGestures={true}
			/>
			
			<PrimaryMenuBar>
			<DrawingMenu
				getTlEditor = {getTlEditor}
				onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
				onActivateTool = {(activatedTool) => {
					const inkPlugin = getGlobals().plugin;
					const isNonDrawTool = activatedTool === 'eraser' || activatedTool === 'select';
					const wasWebsocketConnectedRef = websocketConnectedRef.current;
					const isBooxConnected = inkPlugin.booxConnection.isConnected();
					agentDrawingBridgeLog('A,C,E', 'tldraw-drawing-editor.tsx:onActivateTool', 'Drawing tool activated', {
						activatedTool,
						wasWebsocketConnectedRef,
						isBooxConnected,
						hasTlEditor: !!tlEditorRef.current,
						file: props.drawingFile.path,
						embedded: !!props.embedded,
					});
					if (isNonDrawTool && websocketConnectedRef.current) {
						websocketConnectedRef.current = false;
						if (adjustThrottleRef.current) clearTimeout(adjustThrottleRef.current);
						if (tlEditorRef.current) unlockTldrawInput(tlEditorRef.current);
						agentDrawingBridgeLog('A,C', 'tldraw-drawing-editor.tsx:onActivateTool', 'Non-draw tool selected; closing Android drawing area', {
							activatedTool,
							isBooxConnected,
							file: props.drawingFile.path,
						});
						inkPlugin.booxConnection.sendCloseDrawingArea();
					} else if (activatedTool === 'draw' && !websocketConnectedRef.current) {
						agentDrawingBridgeLog('A,B,C,E', 'tldraw-drawing-editor.tsx:onActivateTool', 'Draw tool selected; opening or reconnecting Android drawing area', {
							activatedTool,
							previousWebsocketConnectedRef: wasWebsocketConnectedRef,
							isBooxConnected,
							file: props.drawingFile.path,
						});
						if (isBooxConnected) {
							websocketConnectedRef.current = true;
							if (tlEditorRef.current) lockTldrawInput(tlEditorRef.current);
							activateDrawingSessionRef.current?.();
							newAndroidDrawingArea();
							if (tlEditorRef.current) {
								inkPlugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(tlEditorRef.current))
							};
						} else {
							void inkPlugin.booxConnection.ensureConnected().catch((error) => {
								verbose(['BooxConnection: reconnect from drawing draw tool failed', error]);
							});
						}
					} else {
						agentDrawingBridgeLog('A', 'tldraw-drawing-editor.tsx:onActivateTool', 'Tool activation did not change Android drawing area', {
							activatedTool,
							wasWebsocketConnectedRef,
							currentWebsocketConnectedRef: websocketConnectedRef.current,
							isBooxConnected,
							isNonDrawTool,
							file: props.drawingFile.path,
						});
					}
				}}
				embedId = {props.embedded && props.embedId ? props.embedId : undefined}
				workspaceLeafId = {props.embedded && props.workspaceLeafId ? props.workspaceLeafId : undefined}
				plugin = {props.embedded ? getGlobals().plugin : undefined}
			/>
				{props.embedded && props.extendedMenu && (
					<ExtendedDrawingMenu
						onLockClick = { async () => {
							// TODO: Save immediately incase it hasn't been saved yet?
							if(props.closeEditor) props.closeEditor();
						}}
						onExpandClick = {props.onOpenInDedicatedView}
						menuOptions = {customExtendedMenu}
					/>
				)}
				{!props.embedded && props.extendedMenu && (
					<ExtendedDrawingMenu
						menuOptions = {customExtendedMenu}
					/>
				)}
			</PrimaryMenuBar>
			<SecondaryMenuBar>
				<ModifyMenu
					getTlEditor = {getTlEditor}
					onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
				/>
			</SecondaryMenuBar>
		</div>

		{props.resizeEmbed && (
			<ResizeHandle
				resizeEmbed={resizeEmbed}
				onResizeStart={props.onResizeStart}
				onResizeEnd={props.onResizeEnd}
			/>
		)}
	</>;

	// Helpers
	///////////////

	function resizeEmbed(pxWidthDiff: number, pxHeightDiff: number) {
		if(!props.resizeEmbed) return;
		props.resizeEmbed(pxWidthDiff, pxHeightDiff);
	}

	/**
	 * Keep tldraw's screenBounds aligned with the DOM container. initDrawingCamera uses
	 * clientWidth/clientHeight; Boox + getBoundingClientRect use layout bounds. Without this,
	 * dedicated view can drift vertically when height changes without a width change (resize
	 * observer only watches width for camera refit).
	 */
	function syncDrawingViewportScreenBoundsFromContainer(editor: Editor) {
		const inkPlugin = getGlobals().plugin;
		if (inkPlugin.settings.booxConnectionEnabled) {
			const surface = getBooxClientAreaRect();
			if (surface && surface.width > 0 && surface.height > 0) {
				editor.updateViewportScreenBounds(
					new Box(surface.x, surface.y, Math.max(surface.width, 1), Math.max(surface.height, 1)),
				);
				if (websocketConnectedRef.current) {
					const sb = editor.getInstanceState().screenBounds;
					agentDrawingBridgeLog(
						'H-sync-vp',
						'tldraw-drawing-editor.tsx:syncDrawingViewportScreenBoundsFromContainer',
						'Synced tldraw screenBounds to Boox drawing surface (viewport-clamped)',
						{
							surfaceRect: { x: surface.x, y: surface.y, w: surface.width, h: surface.height },
							screenBoundsAfter: { x: sb.x, y: sb.y, w: sb.w, h: sb.h },
							dpr: window.devicePixelRatio,
							embedded: !!props.embedded,
						},
					);
				}
				return;
			}
		}
		const cr = editor.getContainer().getBoundingClientRect();
		editor.updateViewportScreenBounds(
			new Box(cr.left, cr.top, Math.max(cr.width, 1), Math.max(cr.height, 1)),
		);
		if (websocketConnectedRef.current) {
			const sb = editor.getInstanceState().screenBounds;
			agentDrawingBridgeLog('H-sync-vp', 'tldraw-drawing-editor.tsx:syncDrawingViewportScreenBoundsFromContainer', 'Synced tldraw viewport screen bounds from DOM container', {
				containerRect: { x: cr.x, y: cr.y, w: cr.width, h: cr.height },
				screenBoundsAfter: { x: sb.x, y: sb.y, w: sb.w, h: sb.h },
				dpr: window.devicePixelRatio,
				embedded: !!props.embedded,
			});
		}
	}

	/** Match writing editor: clip to `window.innerWidth` / `innerHeight` so Bridge sees only visible CSS pixels. */
	function clampDrawingSurfaceRectToVisibleViewport(surfaceRect: DOMRect): DOMRect {
		const visibleTop = Math.max(0, surfaceRect.y);
		const visibleBottom = Math.min(window.innerHeight, surfaceRect.y + surfaceRect.height);
		const visibleLeft = Math.max(0, surfaceRect.x);
		const visibleRight = Math.min(window.innerWidth, surfaceRect.x + surfaceRect.width);
		const width = Math.round(Math.max(0, visibleRight - visibleLeft));
		const height = Math.round(Math.max(0, visibleBottom - visibleTop));
		return new DOMRect(Math.round(visibleLeft), Math.round(visibleTop), width, height);
	}

	/**
	 * Client rect for eInk Bridge overlay + stroke→screen mapping. Embeds use the full
	 * editor wrapper (matches embed layout). Dedicated view uses the tldraw container rect so
	 * it matches updateViewportScreenBounds / screenToPage. Clamped to the visible viewport
	 * (same as writing) so Obsidian/Boox chrome does not desync overlay vs WebView coordinates.
	 */
	function getBooxClientAreaRect(): DOMRect | null {
		const wrapper = editorWrapperRefEl.current;
		if (!wrapper) return null;
		let raw: DOMRect;
		if (props.embedded) {
			raw = wrapper.getBoundingClientRect();
		} else {
			const editor = tlEditorRef.current;
			if (!editor) {
				raw = wrapper.getBoundingClientRect();
			} else {
				const cr = editor.getContainer().getBoundingClientRect();
				raw = cr.width > 1 && cr.height > 1 ? cr : wrapper.getBoundingClientRect();
			}
		}
		const clamped = clampDrawingSurfaceRectToVisibleViewport(raw);
		if (clamped.width <= 0 || clamped.height <= 0) {
			return null;
		}
		return clamped;
	}

	function buildBooxDrawingAreaPayload():
		| {
				x: number;
				y: number;
				canvasWidth: number;
				canvasHeight: number;
				appWidth: number;
				appHeight: number;
		  }
		| null {
		const surfaceRect = getBooxClientAreaRect();
		if (!surfaceRect) return null;
		const canvasWidth = Math.round(surfaceRect.width);
		const canvasHeight = Math.round(surfaceRect.height);
		if (canvasWidth === 0 || canvasHeight === 0) return null;
		return {
			x: Math.round(surfaceRect.x),
			y: Math.round(surfaceRect.y),
			canvasWidth,
			canvasHeight,
			appWidth: window.innerWidth,
			appHeight: window.innerHeight,
		};
	}


	/** Sends new-drawing-area to the Bridge. Returns true if the message was sent,
	 *  false if it bailed early (zero dims or missing ref). Callers that need the
	 *  overlay to appear should set pendingNewOverlayRef when false is returned so
	 *  the ResizeObserver can retry once layout is complete. */
	function newAndroidDrawingArea(): boolean {
		if(!editorWrapperRefEl.current) return false;

		const inkPlugin = getGlobals().plugin;
		if (!inkPlugin.settings.booxConnectionEnabled) return false;

		const payload = buildBooxDrawingAreaPayload();
		if (!payload) return false;

		const vv =
			typeof visualViewport !== 'undefined' && visualViewport
				? {
						width: visualViewport.width,
						height: visualViewport.height,
						scale: visualViewport.scale,
						offsetTop: visualViewport.offsetTop,
						offsetLeft: visualViewport.offsetLeft,
					}
				: null;
		agentDrawingBridgeLog('B,C', 'tldraw-drawing-editor.tsx:newAndroidDrawingArea', 'Computed Android drawing area for new overlay', {
			x: payload.x,
			y: payload.y,
			canvasWidth: payload.canvasWidth,
			canvasHeight: payload.canvasHeight,
			appWidth: payload.appWidth,
			appHeight: payload.appHeight,
			file: props.drawingFile.path,
			dpr: window.devicePixelRatio,
			innerW: window.innerWidth,
			innerH: window.innerHeight,
			visualViewport: vv,
		});
		inkPlugin.booxConnection.sendNewDrawingArea(payload);
		return true;
	}

	function getBooxStrokeSizeCssPx(editor: Editor): number {
		// Boox overlay strokes render lighter than equivalent tldraw strokes due to pressure
		// sensitivity differences, so we scale up to compensate.
		const BOOX_STROKE_SIZE_SCALE = 2;
		const TLDRAW_SIZE_TO_BASE_PX: Record<string, number> = { s: 2, m: 3.5, l: 5, xl: 10 };
		const sizeStyle = editor.getStyleForNextShape(DefaultSizeStyle);
		const basePx = TLDRAW_SIZE_TO_BASE_PX[sizeStyle] ?? TLDRAW_SIZE_TO_BASE_PX['m'];
		const zoom = editor.getCamera().z;
		return basePx * zoom * BOOX_STROKE_SIZE_SCALE;
	}

	function adjustAndroidDrawingArea() {
		if (adjustThrottleRef.current) clearTimeout(adjustThrottleRef.current);

		adjustThrottleRef.current = setTimeout(() => {
			adjustThrottleRef.current = null;
			sendAdjustment();
		}, 200);
	}

	function sendAdjustment() {
		if(!editorWrapperRefEl.current) return;
		if (!websocketConnectedRef.current) return;
		if (!isViewActiveRef.current) return;

		const inkPlugin = getGlobals().plugin;
		if (!inkPlugin.settings.booxConnectionEnabled) return;

		const payload = buildBooxDrawingAreaPayload();
		if (!payload) return;

		const vv =
			typeof visualViewport !== 'undefined' && visualViewport
				? {
						width: visualViewport.width,
						height: visualViewport.height,
						scale: visualViewport.scale,
						offsetTop: visualViewport.offsetTop,
						offsetLeft: visualViewport.offsetLeft,
					}
				: null;
		agentDrawingBridgeLog('B,C', 'tldraw-drawing-editor.tsx:sendAdjustment', 'Computed Android drawing area update', {
			x: payload.x,
			y: payload.y,
			canvasWidth: payload.canvasWidth,
			canvasHeight: payload.canvasHeight,
			appWidth: payload.appWidth,
			appHeight: payload.appHeight,
			file: props.drawingFile.path,
			dpr: window.devicePixelRatio,
			innerW: window.innerWidth,
			innerH: window.innerHeight,
			visualViewport: vv,
		});
		inkPlugin.booxConnection.sendUpdateDrawingArea(payload);
	}

	function removeCanvasDebugOverlays() {
		document.getElementById('debug-drawing-area-overlay')?.remove();
		editorWrapperRefEl.current?.querySelectorAll('.debug-stroke-dot').forEach(el => el.remove());
	}

	function drawCanvasDebugOverlays(options: {
		rect?: { x: number; y: number; width: number; height: number },
		strokePoints?: CanvasRelativeStrokePoint[],
	}) {
		// Drawing area rect overlay
		if (options.rect) {
			document.getElementById('debug-drawing-area-overlay')?.remove();
			const overlay = document.createElement('div');
			overlay.id = 'debug-drawing-area-overlay';
			overlay.className = 'debug-rectangle';
			overlay.style.position = 'fixed';
			overlay.style.boxShadow = 'inset 0 0 0 5px rgba(255,0,0,0.2)';
			overlay.style.pointerEvents = 'none';
			overlay.style.zIndex = '9999';
			overlay.style.left = options.rect.x + 'px';
			overlay.style.top = options.rect.y + 'px';
			overlay.style.width = options.rect.width + 'px';
			overlay.style.height = options.rect.height + 'px';
			document.body.appendChild(overlay);
		}

		// Stroke point dot overlays
		if (options.strokePoints && editorWrapperRefEl.current) {
			editorWrapperRefEl.current.querySelectorAll('.debug-stroke-dot').forEach(el => el.remove());
			options.strokePoints.forEach((strokePoint) => {
				if (!editorWrapperRefEl.current) return;
				const dot = document.createElement('div');
				dot.className = 'debug-stroke-dot';
				dot.style.position = 'absolute';
				dot.style.left = strokePoint.x + 'px';
				dot.style.top = strokePoint.y + 'px';
				dot.style.width = '2px';
				dot.style.height = '2px';
				dot.style.borderRadius = '50%';
				dot.style.backgroundColor = 'red';
				dot.style.pointerEvents = 'none';
				dot.style.zIndex = '9999';
				editorWrapperRefEl.current.appendChild(dot);
			});
		}
	}


	/**
	 * Converts Boox formatted stroke points to a common format
	 */
	function createStrokeFromBoox(
		canvasRelativeStrokePoints: CanvasRelativeStrokePoint[],
		booxStrokeMeta?: { strokeId?: number; canvasWidth?: number; canvasHeight?: number },
	): boolean {
		if(!editorWrapperRefEl.current) return false;
		if(!tlEditorRef.current) return false;

		const editor = tlEditorRef.current;
		// Runtime evidence (ingest-logs.ndjson): dedicated `new-drawing-area` used 813×965 while
		// `getViewportPageBounds()` can lag if screenBounds are stale — sync before mapping.
		syncDrawingViewportScreenBoundsFromContainer(editor);
		const tlBounds = editor.getViewportPageBounds();
		const surfaceRect = getBooxClientAreaRect();
		if (!surfaceRect) return false;
		const wrapperRect = editorWrapperRefEl.current.getBoundingClientRect();
		const tlContainer = editor.getContainer();
		const containerRect = tlContainer?.getBoundingClientRect();

		const payloadCw = booxStrokeMeta?.canvasWidth;
		const payloadCh = booxStrokeMeta?.canvasHeight;
		const firstPt = canvasRelativeStrokePoints[0];
		const lastPt = canvasRelativeStrokePoints[canvasRelativeStrokePoints.length - 1];

		info([
			'Boox drawing stroke received',
			{
				strokeId: booxStrokeMeta?.strokeId,
				pointCount: canvasRelativeStrokePoints.length,
				payloadCanvasW: payloadCw,
				payloadCanvasH: payloadCh,
				embedded: !!props.embedded,
				file: props.drawingFile.path,
			},
		]);

		// Use the same canvas dimensions the bridge used when scaling into client space
		// (see StrokePayload canvasWidth/canvasHeight + scaleDeviceOverlayCoordsToClientCanvas).
		const sourceCanvasWidth =
			payloadCw && payloadCw > 0 ? payloadCw : surfaceRect.width;
		const sourceCanvasHeight =
			payloadCh && payloadCh > 0 ? payloadCh : surfaceRect.height;

		const screenBounds = editor.getInstanceState().screenBounds;
		let firstPageYLinear: number | null = null;
		let firstPageYScreen: number | null = null;
		let legacyFirstPageFromScreenToPage: { x: number; y: number } | null = null;
		if (firstPt && sourceCanvasWidth > 0 && sourceCanvasHeight > 0) {
			const xScaleCoeff0 = tlBounds.w / sourceCanvasWidth;
			const yScaleCoeff0 = tlBounds.h / sourceCanvasHeight;
			firstPageYLinear = tlBounds.y + firstPt.y * yScaleCoeff0;
			const sx =
				surfaceRect.left +
				(firstPt.x / sourceCanvasWidth) * surfaceRect.width;
			const sy =
				surfaceRect.top +
				(firstPt.y / sourceCanvasHeight) * surfaceRect.height;
			legacyFirstPageFromScreenToPage = editor.screenToPage({ x: sx, y: sy });
			firstPageYScreen = legacyFirstPageFromScreenToPage.y;
		}

		const containerEl = editor.getContainer();
		const containerClientH = containerEl.clientHeight;
		const containerBoundingH = containerEl.getBoundingClientRect().height;
		const vpSb = editor.getViewportScreenBounds();
		const vpScreenH = vpSb.h;
		const cam = editor.getCamera();
		const vv =
			typeof visualViewport !== 'undefined' && visualViewport
				? {
						width: visualViewport.width,
						height: visualViewport.height,
						scale: visualViewport.scale,
						offsetTop: visualViewport.offsetTop,
						offsetLeft: visualViewport.offsetLeft,
					}
				: null;

		const mappingDebugData = {
			embedded: !!props.embedded,
			strokeId: booxStrokeMeta?.strokeId,
			surfaceLeft: surfaceRect.left,
			surfaceTop: surfaceRect.top,
			surfaceW: surfaceRect.width,
			surfaceH: surfaceRect.height,
			wrapperLeft: wrapperRect.left,
			wrapperTop: wrapperRect.top,
			wrapperW: wrapperRect.width,
			wrapperH: wrapperRect.height,
			surfaceHMinusWrapperH: surfaceRect.height - wrapperRect.height,
			payloadCw,
			payloadCh,
			sourceCanvasW: sourceCanvasWidth,
			sourceCanvasH: sourceCanvasHeight,
			deltaH: payloadCh != null ? surfaceRect.height - payloadCh : null,
			deltaW: payloadCw != null ? surfaceRect.width - payloadCw : null,
			tlBounds: { x: tlBounds.x, y: tlBounds.y, w: tlBounds.w, h: tlBounds.h },
			screenBounds: {
				x: screenBounds.x,
				y: screenBounds.y,
				w: screenBounds.w,
				h: screenBounds.h,
			},
			viewportScreenBounds: { x: vpSb.x, y: vpSb.y, w: vpSb.w, h: vpSb.h },
			screenHMinusSurfaceH: screenBounds.h - surfaceRect.height,
			containerTopMinusSurfaceTop: containerRect != null ? containerRect.top - surfaceRect.top : null,
			containerH: containerRect?.height,
			containerClientH,
			containerBoundingH,
			vpScreenH,
			clientHMinusBoundingH: containerClientH - containerBoundingH,
			firstCanvasY: firstPt?.y,
			lastCanvasY: lastPt?.y,
			firstPageYLinear,
			firstPageYScreen,
			firstPageYDelta:
				firstPageYLinear != null && firstPageYScreen != null
					? firstPageYScreen - firstPageYLinear
					: null,
			legacyScreenToPageFirstPage: legacyFirstPageFromScreenToPage,
			pointCount: canvasRelativeStrokePoints.length,
			devicePixelRatio: window.devicePixelRatio,
			innerWidth: window.innerWidth,
			innerHeight: window.innerHeight,
			visualViewport: vv,
			camera: { x: cam.x, y: cam.y, z: cam.z },
		};
		debug(['Boox stroke mapping context', mappingDebugData]);

		if (sourceCanvasWidth <= 0 || sourceCanvasHeight <= 0) return false;

		// Map canvas → client pixels on the drawing surface, then through tldraw's camera.
		// `getViewportPageBounds()` is only the *visible* page slice; linear canvas→tlBounds
		// squashed full 813×965 strokes into that slice and caused vertical drift (especially
		// at the bottom). `syncDrawingViewportScreenBoundsFromContainer` runs above so
		// screenBounds match the container before screenToPage.
		const xScaleCoeffLinearRef = tlBounds.w / sourceCanvasWidth;
		const yScaleCoeffLinearRef = tlBounds.h / sourceCanvasHeight;
		const tldrawStrokePoints = canvasRelativeStrokePoints.map(
			(canvasStrokePoint: CanvasRelativeStrokePoint) => {
				const sx =
					surfaceRect.left +
					(canvasStrokePoint.x / sourceCanvasWidth) * surfaceRect.width;
				const sy =
					surfaceRect.top +
					(canvasStrokePoint.y / sourceCanvasHeight) * surfaceRect.height;
				const page = editor.screenToPage({ x: sx, y: sy });
				return {
					x: page.x,
					y: page.y,
					z: canvasStrokePoint.pressure,
				};
			},
		);

		const firstMapped = tldrawStrokePoints[0];
		const lastMapped = tldrawStrokePoints[tldrawStrokePoints.length - 1];
		const fullStrokeDebug = {
			...mappingDebugData,
			mappingMode: 'screenToPage-after-sync',
			xScaleCoeffLinearRef,
			yScaleCoeffLinearRef,
			mappedFirstPage: firstMapped ? { x: firstMapped.x, y: firstMapped.y } : null,
			mappedLastPage: lastMapped ? { x: lastMapped.x, y: lastMapped.y } : null,
			firstScreenClient: firstPt
				? {
						sx:
							surfaceRect.left +
							(firstPt.x / sourceCanvasWidth) * surfaceRect.width,
						sy:
							surfaceRect.top +
							(firstPt.y / sourceCanvasHeight) * surfaceRect.height,
					}
				: null,
			lastScreenClient: lastPt
				? {
						sx:
							surfaceRect.left +
							(lastPt.x / sourceCanvasWidth) * surfaceRect.width,
						sy:
							surfaceRect.top +
							(lastPt.y / sourceCanvasHeight) * surfaceRect.height,
					}
				: null,
		};
		debug(['Boox stroke mapped (screenToPage-after-sync)', fullStrokeDebug]);
		// #region agent log
		postAgentDebugIngest({
			hypothesisId: 'H-plugin-stroke-map-full',
			location: 'tldraw-drawing-editor.tsx:createStrokeFromBoox',
			message: 'Boox stroke canvas→screen→page (screenToPage-after-sync; linear tlBounds ref in data)',
			data: fullStrokeDebug,
			runId: AGENT_DEBUG_RUN_ID,
		});
		// #endregion

		// FOR DEBUGGING ONLY
		// drawCanvasDebugOverlays({ strokePoints: canvasRelativeStrokePoints });

		createTldrawStroke(tldrawStrokePoints);
		return true;
	}


	interface TldrawStrokePoint {
		x: number,
		y: number,
		z?: number,
	}
	function createTldrawStroke(strokePoints: TldrawStrokePoint[]) {
		if(!tlEditorRef.current) return;
		verbose(["Creating stroke", strokePoints]);
	
		bypassReadonly(tlEditorRef.current, () => {
			tlEditorRef.current!.createShape({
				type: 'draw',
				props: {
					isPen: true,
					segments: [
						{
							type: 'free',
							points: strokePoints,
						}
					]
				}
			})
		});
	}

};

// (helpers removed; handled by FingerBlocker)


