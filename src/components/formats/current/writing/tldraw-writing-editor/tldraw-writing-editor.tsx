import './tldraw-writing-editor.scss';
import { Box, DefaultSizeStyle, Editor, TLCamera, getSnapshot, TldrawOptions, TldrawEditor, defaultTools, defaultShapeTools, defaultShapeUtils, TldrawScribble, TldrawShapeIndicators, TldrawSelectionForeground, TldrawSelectionBackground, TldrawHandles, TLEditorSnapshot, TLEventInfo } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, WritingCameraLimits, adaptTldrawToObsidianThemeMode, bypassReadonly, focusChildTldrawEditor, getActivityType, getLineHeightFromEditor, getTightWritingBounds, getWritingSvg, initWritingCamera, initWritingCameraLimits, lockTldrawInput, prepareWritingSnapshot, preventTldrawCanvasesCausingObsidianGestures, resizeWritingTemplateForDedicatedView, resizeWritingTemplateInvitingly, resizeWritingTemplateInvitinglyIfNecessary, resizeWritingTemplate, restrictWritingCamera, silentlyChangeStore, startCameraResizeObserver, startCameraSettleRaf, unlockTldrawInput, updateWritingStoreIfNeeded, useStash } from "src/components/formats/current/utils/tldraw-helpers";
import { WritingContainerUtil } from "../shapes/writing-container"
import { WritingMenu, tool as WritingTool } from "src/components/jsx-components/writing-menu/writing-menu";
import InkPlugin from "src/main";
import * as React from "react";
import { MENUBAR_HEIGHT_PX, WRITE_LONG_DELAY_MS, WRITE_SHORT_DELAY_MS, WRITING_LINE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';
import { InkFileData } from 'src/components/formats/current/types/file-data';
import { buildWritingFileData } from 'src/components/formats/current/utils/build-file-data';
import { TFile } from 'obsidian';
import { PrimaryMenuBar } from 'src/components/jsx-components/primary-menu-bar/primary-menu-bar';
import ExtendedWritingMenu from 'src/components/jsx-components/extended-writing-menu/extended-writing-menu';
import classNames from 'classnames';
import { WritingLinesUtil } from '../shapes/writing-lines';
import { embedsInEditModeAtom } from '../writing-embed/writing-embed';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { FingerBlocker } from 'src/components/jsx-components/finger-blocker/finger-blocker';
import { useAtomValue } from 'jotai';
import { info, verbose } from 'src/logic/utils/universal-dev-logging';
import { logToVault } from 'src/logic/utils/log-to-vault';
import { SecondaryMenuBar } from 'src/tldraw/secondary-menu-bar/secondary-menu-bar';
import ModifyMenu from 'src/tldraw/modify-menu/modify-menu';
import { ExpandLinesButton } from 'src/tldraw/expand-lines-button/expand-lines-button';
import { syncUnifiedUndoHistory, initialize } from 'src/logic/undo-redo/unified-undo-stack';
import { getRegisteredEmbedCountForLeaf, register as registerInkEditor, unregister as unregisterInkEditor } from 'src/logic/undo-redo/ink-editor-registry';
import { registerDedicatedInkEditor, unregisterDedicatedInkEditor } from 'src/logic/undo-redo/dedicated-ink-editor-registry';
import { getObsidianUndoDepthForLeaf } from 'src/logic/undo-redo/obsidian-undo-depth';
import { getTldrawNumUndos } from 'src/logic/undo-redo/tldraw-undo-depth';

///////
///////

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

interface BooxStrokePayload {
	strokeId?: number;
	points?: CanvasRelativeStrokePoint[];
	canvasWidth?: number;
	canvasHeight?: number;
}

interface TldrawStrokePoint {
	x: number,
	y: number,
	z?: number,
}

interface TldrawWritingEditorProps {
	onResize?: (invitingBounds: Box, tightBounds: Box) => void,
	plugin: InkPlugin,
	/** Owning workspace leaf; empty string if unresolved (embed unified undo skipped). */
	workspaceLeafId: string,
	embedId?: string,
	writingFile: TFile,
    save: (inkFileData: InkFileData) => void,
	extendedMenu?: any[],

	// For embeds
	embedded?: boolean,
	resizeEmbedContainer?: (pxHeight: number) => void,
	closeEditor?: Function,
	saveControlsReference?: Function,
	onOpenInDedicatedView?: Function,
}

// Wraps the component so that it can full unmount when inactive
export const TldrawWritingEditorWrapper: React.FC<TldrawWritingEditorProps> = (props) => {
    const embedsInEditMode = useAtomValue(embedsInEditModeAtom);
    const editorActive = !!props.embedId && embedsInEditMode.has(props.embedId);

    if(editorActive) {
        return <TldrawWritingEditor {...props} />
    } else {
        return <></>
    }
}

const MyCustomShapes = [WritingContainerUtil, WritingLinesUtil];
const myOverrides: Record<string, never> = {}
const tlOptions: Partial<TldrawOptions> = {
	defaultSvgPadding: 0,
}
const stableShapeUtils = [...defaultShapeUtils, ...MyCustomShapes];
const stableTools = [...defaultTools, ...defaultShapeTools];
const stableComponents = {
	Scribble: TldrawScribble,
	ShapeIndicators: TldrawShapeIndicators,
	CollaboratorScribble: TldrawScribble,
	SelectionForeground: TldrawSelectionForeground,
	SelectionBackground: TldrawSelectionBackground,
	Handles: TldrawHandles,
}

export function TldrawWritingEditor(props: TldrawWritingEditorProps) {

	const [tlEditorSnapshot, setTlEditorSnapshot] = React.useState<TLEditorSnapshot>()
	const resizePostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const tlEditorRef = useRef<Editor>();
	const editorWrapperRefEl = useRef<HTMLDivElement>(null);
	const curHeightRef = useRef<number | null>(null);
	const { stashStaleContent, unstashStaleContent } = useStash(props.plugin);
	const cameraLimitsRef = useRef<WritingCameraLimits>();
	const adjustThrottleRef = useRef<NodeJS.Timeout | null>(null);
	const websocketConnectedRef = useRef(false);
	/** False while the host leaf is inactive — suppresses Bridge updates from hidden surfaces. */
	const isViewActiveRef = useRef(true);
	const setBooxOverlayActiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingNewOverlayRef = useRef(false);
	const activateWritingSessionRef = useRef<(() => void) | null>(null);
	const panZoomCleanupFnsRef = useRef<Array<() => void>>([]);
	const [booxConnected, setBooxConnected] = React.useState(false);
	const pendingBooxStrokeCompletionsRef = useRef(0);
	const isAndroidDrawingAreaResizingRef = useRef(false);
	const queuedBooxStrokePayloadsRef = useRef<BooxStrokePayload[]>([]);
	const [preventTransitions, setPreventTransitions] = React.useState<boolean>(true);

	// On mount
	React.useEffect( ()=> {
		verbose('EDITOR mounted');
		logToVault('Writing editor mounted: ' + props.writingFile.path + (props.embedded ? ' [embed]' : ' [dedicated]'));
		fetchFileData();
		return () => {
			verbose('EDITOR unmounting');
			logToVault('Writing editor unmounted: ' + props.writingFile.path);
		}
	}, [])

	// Boox companion app: mirror the drawing editor lifecycle for writing embeds.
	React.useEffect(() => {
		if (!tlEditorSnapshot) return;
		if (!props.plugin.settings.booxConnectionEnabled) return;

		const { unregister, activate } = props.plugin.booxConnection.registerDrawingSession({
			onStrokeStart: () => {
				info(['Boox stroke-start received, cancelling pending resize debounce', {
					isResizing: isAndroidDrawingAreaResizingRef.current,
					queuedCount: queuedBooxStrokePayloadsRef.current.length,
					hasPendingResizeTimer: resizePostProcessTimeoutRef.current !== undefined,
				}]);
				cancelDelayedBooxResizePostProcess();
			},
			onStroke: (strokePoints: unknown) => {
				const payload = strokePoints as BooxStrokePayload;
				const strokePayload = {
					strokeId: payload.strokeId,
					points: payload.points ?? (strokePoints as CanvasRelativeStrokePoint[]),
					canvasWidth: payload.canvasWidth,
					canvasHeight: payload.canvasHeight,
				};
				if (isAndroidDrawingAreaResizingRef.current) {
					info(['Boox stroke QUEUED (resize in progress)', {
						strokeId: strokePayload.strokeId,
						queuedCountBefore: queuedBooxStrokePayloadsRef.current.length,
						canvasWidth: strokePayload.canvasWidth,
						canvasHeight: strokePayload.canvasHeight,
					}]);
					queuedBooxStrokePayloadsRef.current.push(strokePayload);
					return;
				}
				info(['Boox stroke rendered IMMEDIATELY (no resize in progress)', {
					strokeId: strokePayload.strokeId,
					canvasWidth: strokePayload.canvasWidth,
					canvasHeight: strokePayload.canvasHeight,
				}]);
				if (createStrokeFromBoox(strokePayload) && strokePayload.strokeId !== undefined) {
					props.plugin.booxConnection.sendStrokeRendered(strokePayload.strokeId);
				}
			},
			onDrawingAreaReady: () => {
				info(['Bridge drawing-area-ready received', {
					wasResizing: isAndroidDrawingAreaResizingRef.current,
					queuedCount: queuedBooxStrokePayloadsRef.current.length,
				}]);
				if (!isAndroidDrawingAreaResizingRef.current && queuedBooxStrokePayloadsRef.current.length === 0) return;
				isAndroidDrawingAreaResizingRef.current = false;
				flushQueuedBooxStrokesAfterResize();
			},
			onSocketOpen: () => {
				info(['Boox writing socket opened for active editor', {
					wasWebsocketConnectedRef: websocketConnectedRef.current,
					hasTlEditor: !!tlEditorRef.current,
					file: props.writingFile.path,
					embedded: !!props.embedded,
				}]);
				websocketConnectedRef.current = true;
				setBooxConnected(true);
				if (tlEditorRef.current) lockTldrawInput(tlEditorRef.current);
				logToVault('Connected writing editor to Boox companion app: ' + props.writingFile.path);
				const sent = newAndroidDrawingArea();
				if (sent) {
					pendingNewOverlayRef.current = false;
					if (tlEditorRef.current) {
						props.plugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(tlEditorRef.current));
					}
				} else {
					pendingNewOverlayRef.current = true;
				}
			},
			onReactivate: () => {
				if (!websocketConnectedRef.current) return;
				if (setBooxOverlayActiveTimerRef.current) clearTimeout(setBooxOverlayActiveTimerRef.current);
				setBooxOverlayActiveTimerRef.current = setTimeout(() => {
					setBooxOverlayActiveTimerRef.current = null;
					if (!websocketConnectedRef.current) return;
					activateWritingSessionRef.current?.();
					const sent = newAndroidDrawingArea();
					if (sent) {
						pendingNewOverlayRef.current = false;
						if (tlEditorRef.current) {
							props.plugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(tlEditorRef.current));
						}
					} else {
						pendingNewOverlayRef.current = true;
					}
				}, 0);
			},
		});
		activateWritingSessionRef.current = activate;

		return () => {
			info(['Boox writing session cleanup (unregister only; close via BooxConnection)', {
				wasWebsocketConnectedRef: websocketConnectedRef.current,
				isBooxConnected: props.plugin.booxConnection.isConnected(),
				file: props.writingFile.path,
				embedded: !!props.embedded,
			}]);
			websocketConnectedRef.current = false;
			setBooxConnected(false);
			pendingNewOverlayRef.current = false;
			if (tlEditorRef.current) unlockTldrawInput(tlEditorRef.current);
			if (adjustThrottleRef.current) clearTimeout(adjustThrottleRef.current);
			if (setBooxOverlayActiveTimerRef.current) clearTimeout(setBooxOverlayActiveTimerRef.current);
			setBooxOverlayActiveTimerRef.current = null;
			activateWritingSessionRef.current = null;
			unregister();
		};
	}, [tlEditorSnapshot])

	React.useEffect(() => {
		if (!tlEditorSnapshot) return;
		if (!editorWrapperRefEl.current) return;

		const scrollEl = editorWrapperRefEl.current.closest('.cm-scroller');
		if (!scrollEl) return;

		const handleScroll = () => {
			if (!isViewActiveRef.current) return;
			adjustAndroidDrawingAreaThrottled();
		};

		scrollEl.addEventListener('scroll', handleScroll);

		return () => {
			scrollEl.removeEventListener('scroll', handleScroll);
		};
	}, [tlEditorSnapshot])

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
			if (pendingNewOverlayRef.current && isViewActiveRef.current && websocketConnectedRef.current) {
				const sent = newAndroidDrawingArea();
				if (sent) {
					pendingNewOverlayRef.current = false;
					if (tlEditorRef.current) {
						props.plugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(tlEditorRef.current));
					}
					return;
				}
				return;
			}
			sendAdjustmentImmediate();
		});

		resizeObserver.observe(editorWrapperRefEl.current);

		return () => {
			resizeObserver.disconnect();
		};
	}, [tlEditorSnapshot])

	React.useEffect(() => {
		return () => {
			panZoomCleanupFnsRef.current.forEach((fn) => fn());
			panZoomCleanupFnsRef.current = [];
		};
	}, []);

	if(!tlEditorSnapshot) return <></>
	verbose('EDITOR snapshot loaded')

	////////

	const handleMount = (_editor: Editor) => {
		const editor = tlEditorRef.current = _editor;
		const leafId = props.workspaceLeafId;
		if (!props.embedded && leafId) {
			registerDedicatedInkEditor(leafId, editor);
		}
		editor.updateInstanceState({ isGridMode: false });
		focusChildTldrawEditor(editorWrapperRefEl.current);
		preventTldrawCanvasesCausingObsidianGestures(editor);

		// If the Boox socket is already open when tldraw mounts, lock input now.
		// The useEffect that runs on tlEditorSnapshot fires before handleMount,
		// so its lockTldrawInput call is skipped because tlEditorRef.current is still null.
		if (props.plugin.settings.booxConnectionEnabled && props.plugin.booxConnection.isConnected()) {
			info(['handleMount: Boox already connected, locking tldraw input', {
				isReadonlyBefore: editor.getInstanceState().isReadonly,
			}]);
			lockTldrawInput(editor);
		}

		if(editorWrapperRefEl.current) {
			editorWrapperRefEl.current.style.opacity = '1';
			// Dedicated view: keep key events on the wrapper (tabIndex + keydown capture).
			// Embeds: avoid stealing focus from Obsidian / CodeMirror.
			if (!props.embedded) {
				editorWrapperRefEl.current.focus({ preventScroll: true });
			}
		}

		updateWritingStoreIfNeeded(editor);
		
		// tldraw content setup
		adaptTldrawToObsidianThemeMode(editor);

		// view set up
		let removeWheelListener: (() => void) | undefined;
		let removeBeforeChangeHandler: (() => void) | undefined;
		let cancelCameraSettleRaf: (() => void) | undefined;
		let disconnectResizeObserver: (() => void) | undefined;
		if(props.embedded) {
			// Resize to content + buffer lines, then lock camera
			logToVault('Writing handleMount: curHeightRef=' + curHeightRef.current);
			const mountHeight = resizeWritingTemplateInvitingly(editor);
			logToVault('Writing handleMount: mountHeight=' + mountHeight);
			if (mountHeight !== null) {
				curHeightRef.current = mountHeight;
				resizeContainerIfEmbed(editor, mountHeight);
			}
			initWritingCamera(editor);
			editor.setCameraOptions({
				isLocked: true,
			})
			// Re-fit zoom on container resize (sidebar toggle, window resize, etc.).
			// Camera must be temporarily unlocked because isLocked blocks programmatic setCamera calls.
			disconnectResizeObserver = startCameraResizeObserver(editor, () => {
				editor.setCameraOptions({ isLocked: false });
				initWritingCamera(editor);
				editor.setCameraOptions({ isLocked: true });
			});
		} else {
			// Set up camera first so resizeWritingTemplateForDedicatedView can use the correct camera.y
			initWritingCamera(editor, MENUBAR_HEIGHT_PX);
			cameraLimitsRef.current = initWritingCameraLimits(editor);

			logToVault('Writing handleMount: curHeightRef=' + curHeightRef.current);
			const mountHeight = resizeWritingTemplateForDedicatedView(editor);
			logToVault('Writing handleMount: mountHeight=' + mountHeight);
			if (mountHeight !== null) curHeightRef.current = mountHeight;

			// Clamp camera before tldraw commits it — eliminates snap-back on middle-mouse pan and any other pan
			removeBeforeChangeHandler = editor.sideEffects.registerBeforeChangeHandler(
				'camera',
				(_prev: TLCamera, next: TLCamera) => {
					const limits = cameraLimitsRef.current;
					if (!limits) return next;
					const pageBounds = editor.getCurrentPageBounds();
					if (!pageBounds) return next;
					const vp = editor.getViewportScreenBounds();
					const yMin = vp.h - pageBounds.maxY * next.z;
					return {
						...next,
						x: Math.max(Math.min(next.x, limits.x.max), limits.x.min),
						y: Math.max(Math.min(next.y, limits.y.max), yMin),
						z: Math.max(Math.min(next.z, limits.zoom.max), limits.zoom.min),
					};
				}
			);

			// Handle wheel: vertical scroll only — intercept before Obsidian sees it
			const wrapperEl = editorWrapperRefEl.current;
			if (wrapperEl) {
				const onWheelScroll = (e: WheelEvent) => {
					e.preventDefault();
					e.stopPropagation();
					let deltaY = e.deltaY;
					if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) deltaY *= 16;
					if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) deltaY *= 600;
					applyDedicatedWritingVerticalScroll(editor, deltaY);
				};
				wrapperEl.addEventListener('wheel', onWheelScroll, { capture: true, passive: false });
				removeWheelListener = () => wrapperEl.removeEventListener('wheel', onWheelScroll, { capture: true });
			}

			// Re-fit camera on each animation frame until the canvas width stabilises after
			// the sidebar collapse animation completes.
			cancelCameraSettleRaf = startCameraSettleRaf(editor, () => {
				cameraLimitsRef.current = undefined;
				initWritingCamera(editor, MENUBAR_HEIGHT_PX);
				cameraLimitsRef.current = initWritingCameraLimits(editor);
			});

			// Re-fit zoom on container resize, preserving the user's scroll position.
			disconnectResizeObserver = startCameraResizeObserver(editor, () => {
				const prevY = editor.getCamera().y;
				cameraLimitsRef.current = undefined;
				initWritingCamera(editor, MENUBAR_HEIGHT_PX);
				cameraLimitsRef.current = initWritingCameraLimits(editor);
				const pageBounds = editor.getCurrentPageBounds();
				const vp = editor.getViewportScreenBounds();
				const cam = editor.getCamera();
				const yMin = pageBounds ? vp.h - pageBounds.maxY * cam.z : cam.y;
				const clampedY = Math.max(yMin, Math.min(cameraLimitsRef.current.y.max, prevY));
				editor.run(() => editor.setCamera({ ...cam, y: clampedY }), { history: 'ignore' });
			});
		}

		const mountCleanupFns: Array<() => void> = [];
		if (disconnectResizeObserver) mountCleanupFns.push(disconnectResizeObserver);
		if (cancelCameraSettleRaf) mountCleanupFns.push(cancelCameraSettleRaf);
		if (removeWheelListener) mountCleanupFns.push(removeWheelListener);
		if (removeBeforeChangeHandler) mountCleanupFns.push(removeBeforeChangeHandler);
		panZoomCleanupFnsRef.current = mountCleanupFns;

		// Unified undo stack: when embedded, sync Obsidian and tldraw history on each user change (per leaf)
		if (props.embedded && props.embedId && leafId && editorWrapperRefEl.current) {
			const obsidianDepth = getObsidianUndoDepthForLeaf(props.plugin, leafId);
			const tldrawUndos = getTldrawNumUndos(editor);
			if (getRegisteredEmbedCountForLeaf(leafId) > 0) {
				initialize(leafId, obsidianDepth, tldrawUndos, undefined, { mergeWithExisting: true, embedId: props.embedId });
			} else {
				initialize(leafId, obsidianDepth, tldrawUndos);
			}
			registerInkEditor(props.embedId, editor, editorWrapperRefEl.current, leafId);
		}

		// Runs on any USER caused change to the store, (Anything wrapped in silently change method doesn't call this).
		const removeUserActionListener = editor.store.listen((entry) => {

			const activity = getActivityType(entry);
			if (activity === Activity.PointerMoved) {
				return;
			}

			switch (activity) {
				case Activity.CameraMovedAutomatically:
				case Activity.CameraMovedManually:
					if(cameraLimitsRef.current) restrictWritingCamera(editor, cameraLimitsRef.current);
					unstashStaleContent(editor);
					if (props.embedded && props.embedId && leafId) {
						syncUnifiedUndoHistory(leafId, props.embedId, { maxTldrawDelta: 1 });
					}
					break;

				case Activity.DrawingStarted:
					resetInputPostProcessTimers();
					stashStaleContent(editor);
					break;
					
				case Activity.DrawingContinued:
					resetInputPostProcessTimers();
					break;
							
				case Activity.DrawingCompleted:
					if (props.embedded && props.embedId && leafId) {
						syncUnifiedUndoHistory(leafId, props.embedId, { maxTldrawDelta: 1 });
					}
					const didCompleteBooxStroke = pendingBooxStrokeCompletionsRef.current > 0;
					if (didCompleteBooxStroke) pendingBooxStrokeCompletionsRef.current -= 1;
					queueOrRunStorePostProcesses(editor, {
						deferResize: didCompleteBooxStroke && props.plugin.settings.booxConnectionEnabled,
					});
					break;
					
				case Activity.DrawingErased:
					if (props.embedded && props.embedId && leafId) {
						syncUnifiedUndoHistory(leafId, props.embedId, { maxTldrawDelta: 1 });
					}
					queueOrRunStorePostProcesses(editor);
					break;
					
				default:
					// Catch anything else not specifically mentioned (ie. draw shape, etc.)
					// queueOrRunStorePostProcesses(editor);
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
			panZoomCleanupFnsRef.current.forEach((fn) => fn());
			panZoomCleanupFnsRef.current = [];
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
					await completeSave(editor);
					unmountActions();	// Clean up immediately so nothing else occurs between this completeSave and a future unmount
				},
				eraseAll: async (): Promise<void> => {
					const allShapes = editor.getCurrentPageShapes();
					const drawShapeIds = allShapes
						.filter(shape => shape.type === 'draw')
						.map(shape => shape.id);
					editor.deleteShapes(drawShapeIds);
					await completeSave(editor);
				},
				resize: () => {
					const camera = editor.getCamera()
					const cameraY = camera.y;
					initWritingCamera(editor);
					editor.setCamera({x: camera.x, y: cameraY})
				},
				setBooxOverlayActive: (isActive: boolean) => {
					isViewActiveRef.current = isActive;
					if (setBooxOverlayActiveTimerRef.current) clearTimeout(setBooxOverlayActiveTimerRef.current);
					setBooxOverlayActiveTimerRef.current = null;
					if (!isActive) pendingNewOverlayRef.current = false;
					if (!websocketConnectedRef.current) return;
					if (!props.plugin.settings.booxConnectionEnabled) return;
					if (isActive) {
						setBooxOverlayActiveTimerRef.current = setTimeout(() => {
							setBooxOverlayActiveTimerRef.current = null;
							if (!websocketConnectedRef.current) return;
							activateWritingSessionRef.current?.();
							const sent = newAndroidDrawingArea();
							if (sent) {
								pendingNewOverlayRef.current = false;
								if (tlEditorRef.current) {
									props.plugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(tlEditorRef.current));
								}
							} else {
								pendingNewOverlayRef.current = true;
							}
						}, 0);
					} else {
						props.plugin.booxConnection.sendCloseDrawingArea();
					}
				},
			})
		}
		
		return () => {
			unmountActions();
		};
	}

	///////////////

	function resizeContainerIfEmbed (editor: Editor, curTlDrawHeight: number) {
		if (!props.embedded || !props.onResize) return;

		const invitingBounds = new Box(0, 0, WRITING_PAGE_WIDTH, curTlDrawHeight);
		const tightBounds = getTightWritingBounds(editor);
		if (!tightBounds) return;

		// --- H1/H2/H4 diagnostic: snapshot state BEFORE resize ---
		const writingLinesShapeBefore = editor.getShape('shape:writing-lines' as any);
		const viewportPageBoundsBefore = editor.getViewportPageBounds();
		const viewportScreenBoundsBefore = editor.getViewportScreenBounds();
		const containerBefore = editor.getContainer().getBoundingClientRect();
		const culledBefore = editor.getCulledShapes();
		const linesGeomBefore = writingLinesShapeBefore ? editor.getShapeGeometry(writingLinesShapeBefore) : null;
		info(['Guide lines diagnostic BEFORE resize', {
			curTlDrawHeight,
			prevHeightRef: curHeightRef.current,
			writingLinesH: (writingLinesShapeBefore as any)?.props?.h,
			linesGeomH: linesGeomBefore?.bounds.h,
			vpPageX: viewportPageBoundsBefore.x, vpPageY: viewportPageBoundsBefore.y, vpPageW: viewportPageBoundsBefore.w, vpPageH: viewportPageBoundsBefore.h,
			vpScreenX: viewportScreenBoundsBefore.x, vpScreenY: viewportScreenBoundsBefore.y, vpScreenW: viewportScreenBoundsBefore.w, vpScreenH: viewportScreenBoundsBefore.h,
			containerW: containerBefore.width, containerH: containerBefore.height,
			isCulled: culledBefore.has('shape:writing-lines' as any),
			culledCount: culledBefore.size,
			cameraX: editor.getCamera().x, cameraY: editor.getCamera().y, cameraZ: editor.getCamera().z,
			zoom: editor.getZoomLevel(),
		}]);

		// Set queuing flag *before* the DOM height changes so any Boox strokes arriving
		// during or after the resize are queued instead of rendered with stale coordinates.
		if (props.plugin.settings.booxConnectionEnabled) {
			info(['Setting resize queuing flag BEFORE DOM change', {
				curTlDrawHeight,
				prevHeight: curHeightRef.current,
				queuedCount: queuedBooxStrokePayloadsRef.current.length,
				wasAlreadyResizing: isAndroidDrawingAreaResizingRef.current,
			}]);
			isAndroidDrawingAreaResizingRef.current = true;
		}

		props.onResize(invitingBounds, tightBounds);

		// Force tldraw to recognise the new container height immediately.
		const container = editor.getContainer();
		const rect = container.getBoundingClientRect();
		editor.updateViewportScreenBounds(
			new Box(rect.left, rect.top, Math.max(rect.width, 1), Math.max(rect.height, 1))
		);

		// --- H1/H2/H4 diagnostic: snapshot state AFTER resize ---
		const writingLinesShapeAfter = editor.getShape('shape:writing-lines' as any);
		const viewportPageBoundsAfter = editor.getViewportPageBounds();
		const viewportScreenBoundsAfter = editor.getViewportScreenBounds();
		const containerAfter = editor.getContainer().getBoundingClientRect();
		const culledAfter = editor.getCulledShapes();
		const linesGeomAfter = writingLinesShapeAfter ? editor.getShapeGeometry(writingLinesShapeAfter) : null;
		const linesMaskedPageBoundsAfter = writingLinesShapeAfter ? editor.getShapeMaskedPageBounds(writingLinesShapeAfter.id) : null;
		const shapeEl = editor.getContainer().querySelector('[data-shape-type="writing-lines"]') as HTMLElement | null;
		info(['Guide lines diagnostic AFTER resize', {
			writingLinesH: (writingLinesShapeAfter as any)?.props?.h,
			linesGeomH: linesGeomAfter?.bounds.h,
			linesMaskedH: linesMaskedPageBoundsAfter?.h,
			vpPageX: viewportPageBoundsAfter.x, vpPageY: viewportPageBoundsAfter.y, vpPageW: viewportPageBoundsAfter.w, vpPageH: viewportPageBoundsAfter.h,
			vpScreenW: viewportScreenBoundsAfter.w, vpScreenH: viewportScreenBoundsAfter.h,
			containerW: containerAfter.width, containerH: containerAfter.height,
			isCulled: culledAfter.has('shape:writing-lines' as any),
			culledCount: culledAfter.size,
			cameraX: editor.getCamera().x, cameraY: editor.getCamera().y, cameraZ: editor.getCamera().z,
			domWidth: shapeEl?.style.width,
			domHeight: shapeEl?.style.height,
			domDisplay: shapeEl?.style.display,
			domOffsetW: shapeEl?.offsetWidth,
			domOffsetH: shapeEl?.offsetHeight,
			domSvgLen: shapeEl?.querySelector('svg')?.innerHTML?.length,
			domFound: !!shapeEl,
		}]);

		// Schedule a delayed re-check to see if tldraw catches up
		setTimeout(() => {
			const linesShapeDelayed = editor.getShape('shape:writing-lines' as any);
			const vpDelayed = editor.getViewportPageBounds();
			const culledDelayed = editor.getCulledShapes();
			const containerDelayed = editor.getContainer().getBoundingClientRect();
			const shapeElDelayed = editor.getContainer().querySelector('[data-shape-type="writing-lines"]') as HTMLElement | null;
			info(['Guide lines 500ms delayed check', {
				writingLinesH: (linesShapeDelayed as any)?.props?.h,
				vpPageW: vpDelayed.w, vpPageH: vpDelayed.h,
				containerW: containerDelayed.width, containerH: containerDelayed.height,
				isCulled: culledDelayed.has('shape:writing-lines' as any),
				domHeight: shapeElDelayed?.style.height,
				domDisplay: shapeElDelayed?.style.display,
				domSvgLen: shapeElDelayed?.querySelector('svg')?.innerHTML?.length,
			}]);
		}, 500);

		// Send the new dimensions to Bridge immediately (no throttle) so it can
		// reposition the overlay and reply with drawing-area-ready to unblock the queue.
		sendAdjustmentImmediate();
	}

	const queueOrRunStorePostProcesses = (editor: Editor, options?: { deferResize?: boolean }) => {
		if (options?.deferResize) {
			debouncedInputResizePostProcess(editor);
		} else {
			instantInputPostProcess(editor);
		}
		smallDelayInputPostProcess(editor);
		longDelayInputPostProcess(editor);
	}

	const debouncedInputResizePostProcess = (editor: Editor) => {
		resetResizePostProcessTimer();
		resizePostProcessTimeoutRef.current = setTimeout(
			() => {
				resizePostProcessTimeoutRef.current = undefined;
				instantInputPostProcess(editor);
			},
			WRITE_SHORT_DELAY_MS
		);
	}

	const cancelDelayedBooxResizePostProcess = () => {
		resetResizePostProcessTimer();
	}

	// Use this to run optimisations that that are quick and need to occur immediately on lifting the stylus
	const instantInputPostProcess = (editor: Editor) => { //, entry?: HistoryEntry<TLRecord>) => {
		logToVault('Writing instantInputPostProcess: curHeightRef=' + curHeightRef.current);
		if (props.embedded) {
			// When Boox is connected, skip automatic resize — the user must press the
			// expand-lines button instead to avoid resize-during-writing conflicts.
			const skipAutoResize = websocketConnectedRef.current;
			if (skipAutoResize) {
				info(['Guide lines: instantInputPostProcess SKIPPED (Boox connected)', {
					curHeight: curHeightRef.current,
				}]);
			} else {
				const prevHeight = curHeightRef.current;
				info(['Guide lines: instantInputPostProcess start', { prevHeight, embedded: true }]);
				const newHeight = resizeWritingTemplateInvitinglyIfNecessary(editor, curHeightRef.current);
				logToVault('Writing instantInputPostProcess: newHeight=' + newHeight);
				info(['Guide lines: instantInputPostProcess result', {
					prevHeight,
					newHeight,
					heightChanged: newHeight !== null && newHeight !== prevHeight,
					willCallResizeContainerIfEmbed: newHeight !== null && newHeight !== prevHeight,
				}]);
				if (newHeight !== null) curHeightRef.current = newHeight;
				if (newHeight !== null && newHeight !== prevHeight) resizeContainerIfEmbed(editor, newHeight);
			}
		} else {
			// Dedicated view: extend to cover viewport bottom + 10 lines at current scroll position
			const newHeight = resizeWritingTemplateForDedicatedView(editor);
			logToVault('Writing instantInputPostProcess: newHeight=' + newHeight);
			if (newHeight !== null) curHeightRef.current = newHeight;
		}
		// entry && simplifyLines(editor, entry);
	};

	// Use this to run optimisations that take a small amount of time but should happen frequently
	const smallDelayInputPostProcess = (editor: Editor) => {
		resetShortPostProcessTimer();
		
		shortDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				incrementalSave(editor);
			},
			WRITE_SHORT_DELAY_MS
		)

	};

	// Use this to run optimisations after a slight delay
	const longDelayInputPostProcess = (editor: Editor) => {
		resetLongPostProcessTimer();
		
		longDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				completeSave(editor);
			},
			WRITE_LONG_DELAY_MS
		)

	};

	const resetShortPostProcessTimer = () => {
		clearTimeout(shortDelayPostProcessTimeoutRef.current);
	}
	const resetResizePostProcessTimer = () => {
		clearTimeout(resizePostProcessTimeoutRef.current);
		resizePostProcessTimeoutRef.current = undefined;
	}
	const resetLongPostProcessTimer = () => {
		clearTimeout(longDelayPostProcessTimeoutRef.current);
	}
	const resetInputPostProcessTimers = () => {
		resetResizePostProcessTimer();
		resetShortPostProcessTimer();
		resetLongPostProcessTimer();
	}

	const incrementalSave = async (editor: Editor) => {
		verbose('incrementalSave');
		logToVault('incrementalSave (writing): ' + props.writingFile.path);
		unstashStaleContent(editor);
		const tlEditorSnapshot = getSnapshot(editor.store);
		const svgObj = await getWritingSvg(editor, curHeightRef.current);
		stashStaleContent(editor);

        const writingFileData = buildWritingFileData({
			tlEditorSnapshot: tlEditorSnapshot,
			svgString: svgObj?.svg,
			writingLineHeight: getLineHeightFromEditor(editor),
		})
		props.save(writingFileData);
	}

	const completeSave = async (editor: Editor): Promise<void> => {
		verbose('completeSave');
		logToVault('completeSave (writing): ' + props.writingFile.path);
        let svgString;
		
		unstashStaleContent(editor);
		const tlEditorSnapshot = getSnapshot(editor.store);
		const svgObj = await getWritingSvg(editor, curHeightRef.current);
		stashStaleContent(editor);
		
        if (svgObj) {
            svgString = svgObj.svg;
			// if(previewUri) addDataURIImage(previewUri)	// NOTE: Option for testing
		}

        if(svgString) {
            const pageData = buildWritingFileData({
                tlEditorSnapshot: tlEditorSnapshot,
                svgString,
                writingLineHeight: getLineHeightFromEditor(editor),
            })
			props.save(pageData);
			// await savePngExport(props.plugin, previewUri, props.fileRef) // REVIEW: Still need a png?

		} else {
            const pageData = buildWritingFileData({
				tlEditorSnapshot: tlEditorSnapshot,
				writingLineHeight: getLineHeightFromEditor(editor),
			})
			props.save(pageData);
		}

		return;
	}

	const getTlEditor = (): Editor | undefined => {
		return tlEditorRef.current;
	};

	function expandWritingLinesByOne() {
		const editor = tlEditorRef.current;
		if (!editor) return;

		const lineHeight = getLineHeightFromEditor(editor);
		const bufferLines = props.plugin.settings.writingBufferLines;
		const prevHeight = curHeightRef.current ?? lineHeight * 2.5; // fallback to min page height
		const newHeight = prevHeight + bufferLines * lineHeight;

		info(['Manual expand-lines clicked', {
			prevHeight,
			newHeight,
			lineHeight,
			bufferLines,
		}]);

		resizeWritingTemplate(editor, new Box(0, 0, WRITING_PAGE_WIDTH, newHeight));
		curHeightRef.current = newHeight;
		resizeContainerIfEmbed(editor, newHeight);
	}

	//////////////

	return <>
		<div
			ref = {editorWrapperRefEl}
			className = {classNames([
				"ddc_ink_writing-editor",
			])}
			style={{
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

				// Undo: Mod+Z
				if (modKey && !e.shiftKey && key === 'z') {
					e.preventDefault();
					editor.undo();
					return;
				}

				// Redo: Mod+Shift+Z or Mod+Y
				if (modKey && ((e.shiftKey && key === 'z') || key === 'y')) {
					e.preventDefault();
					editor.redo();
					return;
				}
			}}
			onPointerDown={() => {
				if (props.embedded) return;
				editorWrapperRefEl.current?.focus({ preventScroll: true });
			}}
		>
			<TldrawEditor
				options = {tlOptions}
				shapeUtils = {stableShapeUtils}
				tools = {stableTools}
				initialState = "draw"
				snapshot = {tlEditorSnapshot}
				// persistenceKey = {props.fileRef.path}

				// bindingUtils = {defaultBindingUtils}
				components = {stableComponents}

				onMount = {handleMount}

				// Prevent autoFocussing so it can be handled in the handleMount / wrapper focus.
				autoFocus = {false}
			/>
			<FingerBlocker
				getTlEditor={getTlEditor}
				wrapperRef={editorWrapperRefEl}
				onVerticalTouchPan={
					props.embedded
						? undefined
						: (deltaY) => {
							const editor = tlEditorRef.current;
							if (editor) applyDedicatedWritingVerticalScroll(editor, deltaY);
						}
				}
			/>

			<PrimaryMenuBar>
				<WritingMenu
					getTlEditor = {getTlEditor}
					onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
					onActivateTool = {(activatedTool) => {
						const isNonDrawTool = activatedTool === WritingTool.eraser || activatedTool === WritingTool.select;
						const wasWebsocketConnectedRef = websocketConnectedRef.current;
						const isBooxConnected = props.plugin.booxConnection.isConnected();
						info(['Writing tool activated', {
							activatedTool,
							wasWebsocketConnectedRef,
							isBooxConnected,
							hasTlEditor: !!tlEditorRef.current,
							file: props.writingFile.path,
							embedded: !!props.embedded,
						}]);
						if (isNonDrawTool && websocketConnectedRef.current) {
							websocketConnectedRef.current = false;
							setBooxConnected(false);
							pendingNewOverlayRef.current = false;
							if (adjustThrottleRef.current) clearTimeout(adjustThrottleRef.current);
							if (tlEditorRef.current) unlockTldrawInput(tlEditorRef.current);
							info(['Non-draw writing tool selected; closing Android drawing area', {
								activatedTool,
								isBooxConnected,
								file: props.writingFile.path,
							}]);
							props.plugin.booxConnection.sendCloseDrawingArea();
						} else if (activatedTool === WritingTool.draw && !websocketConnectedRef.current) {
							info(['Draw writing tool selected; opening or reconnecting Android drawing area', {
								activatedTool,
								previousWebsocketConnectedRef: wasWebsocketConnectedRef,
								isBooxConnected,
								file: props.writingFile.path,
							}]);
							if (isBooxConnected) {
								websocketConnectedRef.current = true;
								setBooxConnected(true);
								if (tlEditorRef.current) lockTldrawInput(tlEditorRef.current);
								activateWritingSessionRef.current?.();
								const sent = newAndroidDrawingArea();
								if (sent) {
									pendingNewOverlayRef.current = false;
									if (tlEditorRef.current) {
										props.plugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(tlEditorRef.current));
									}
								} else {
									pendingNewOverlayRef.current = true;
								}
							} else {
								void props.plugin.booxConnection.ensureConnected().catch((error) => {
									verbose(['BooxConnection: reconnect from writing draw tool failed', error]);
								});
							}
						} else {
							info(['Writing tool activation did not change Android drawing area', {
								activatedTool,
								wasWebsocketConnectedRef,
								currentWebsocketConnectedRef: websocketConnectedRef.current,
								isBooxConnected,
								isNonDrawTool,
								file: props.writingFile.path,
							}]);
						}
					}}
					embedId = {props.embedded && props.embedId ? props.embedId : undefined}
					workspaceLeafId = {props.embedded && props.workspaceLeafId ? props.workspaceLeafId : undefined}
					plugin = {props.embedded && props.plugin ? props.plugin : undefined}
				/>
				{props.embedded && props.extendedMenu && (
					<ExtendedWritingMenu
						onLockClick = { async () => {
							// Force a final onResize emission so preview aspect ratio is fresh at lock time.
							// This avoids using a stale tightBounds ratio when content changed within the buffer zone.
							const editor = tlEditorRef.current;
							if (editor && curHeightRef.current != null) {
								resizeContainerIfEmbed(editor, curHeightRef.current);
							}
							// REVIEW: Save immediately? incase it hasn't been saved yet
							if(props.closeEditor) props.closeEditor();
						}}
						onExpandClick = {props.onOpenInDedicatedView}
						menuOptions = {props.extendedMenu}
					/>
				)}
				{!props.embedded && props.extendedMenu && (
					<ExtendedWritingMenu
						menuOptions = {props.extendedMenu}
					/>
				)}
			</PrimaryMenuBar>

			<SecondaryMenuBar>
				<ModifyMenu
					getTlEditor = {getTlEditor}
					onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
				/>
				{props.embedded && booxConnected && (
					<ExpandLinesButton
						onExpandLines = {expandWritingLinesByOne}
					/>
				)}
			</SecondaryMenuBar>
			
		</div>
	</>;

	// Helper functions
	///////////////////

	/** Clamp a canvas rect to the portion visible on screen so the Bridge overlay matches 1:1 */
	function clampToVisibleViewport(embedRect: DOMRect) {
		const visibleTop = Math.max(0, embedRect.y);
		const visibleBottom = Math.min(window.innerHeight, embedRect.y + embedRect.height);
		const visibleLeft = Math.max(0, embedRect.x);
		const visibleRight = Math.min(window.innerWidth, embedRect.x + embedRect.width);
		return {
			x: Math.round(visibleLeft),
			y: Math.round(visibleTop),
			width: Math.round(Math.max(0, visibleRight - visibleLeft)),
			height: Math.round(Math.max(0, visibleBottom - visibleTop)),
		};
	}

	function newAndroidDrawingArea(): boolean {
		if(!editorWrapperRefEl.current) {
			info(['Skipped writing overlay because wrapper is missing', {
				file: props.writingFile.path,
				hasTlEditor: !!tlEditorRef.current,
			}]);
			return false;
		}

		if (!props.plugin.settings.booxConnectionEnabled) return false;

		const windowWidth = window.innerWidth;
		const windowHeight = window.innerHeight;

		const embedRect = editorWrapperRefEl.current.getBoundingClientRect();
		const visible = clampToVisibleViewport(embedRect);
		const canvasX = visible.x;
		const canvasY = visible.y;
		const canvasWidth = visible.width;
		const canvasHeight = visible.height;

		if (canvasWidth <= 0 || canvasHeight <= 0) {
			info(['Skipped writing new-drawing-area — zero canvas dimensions', {
				canvasWidth,
				canvasHeight,
				file: props.writingFile.path,
			}]);
			return false;
		}

		info(['Computed Android drawing area for writing overlay', {
			x: canvasX,
			y: canvasY,
			canvasWidth,
			canvasHeight,
			rawEmbedHeight: Math.round(embedRect.height),
			appWidth: windowWidth,
			appHeight: windowHeight,
			file: props.writingFile.path,
		}]);
		props.plugin.booxConnection.sendNewDrawingArea({
			x: canvasX,
			y: canvasY,
			canvasWidth: canvasWidth,
			canvasHeight: canvasHeight,
			appWidth: windowWidth,
			appHeight: windowHeight,
		});
		return true;
	}

	function getBooxStrokeSizeCssPx(editor: Editor): number {
		const BOOX_STROKE_SIZE_SCALE = 2;
		const TLDRAW_SIZE_TO_BASE_PX: Record<string, number> = { s: 2, m: 3.5, l: 5, xl: 10 };
		const sizeStyle = editor.getStyleForNextShape(DefaultSizeStyle);
		const basePx = TLDRAW_SIZE_TO_BASE_PX[sizeStyle] ?? TLDRAW_SIZE_TO_BASE_PX['m'];
		const zoom = editor.getCamera().z;
		return basePx * zoom * BOOX_STROKE_SIZE_SCALE;
	}

	/** Throttled variant — use for scroll events that fire rapidly and benefit from coalescing. */
	function adjustAndroidDrawingAreaThrottled() {
		if (!isViewActiveRef.current) return;
		if (adjustThrottleRef.current) clearTimeout(adjustThrottleRef.current);

		adjustThrottleRef.current = setTimeout(() => {
			adjustThrottleRef.current = null;
			sendAdjustment(false);
		}, 200);
	}

	/** Immediate variant — use when the DOM has already resized and we need Bridge to catch up ASAP.
	 *  Uses a 50ms micro-debounce to collapse rapid duplicate sends (e.g. when a resize triggers
	 *  store changes that trigger another resize check, both producing the same dimensions). */
	function sendAdjustmentImmediate() {
		if (adjustThrottleRef.current) clearTimeout(adjustThrottleRef.current);
		adjustThrottleRef.current = setTimeout(() => {
			adjustThrottleRef.current = null;
			info(['Sending IMMEDIATE update-drawing-area (micro-debounced)', {}]);
			sendAdjustment(true);
		}, 50) as unknown as ReturnType<typeof setTimeout>;
	}

	function sendAdjustment(immediate: boolean) {
		if(!editorWrapperRefEl.current) return;
		if (!websocketConnectedRef.current) return;
		if (!isViewActiveRef.current) return;
		if (!props.plugin.settings.booxConnectionEnabled) return;

		const windowWidth = window.innerWidth;
		const windowHeight = window.innerHeight;

		const embedRect = editorWrapperRefEl.current.getBoundingClientRect();
		const visible = clampToVisibleViewport(embedRect);
		const canvasX = visible.x;
		const canvasY = visible.y;
		const canvasWidth = visible.width;
		const canvasHeight = visible.height;

		if (canvasWidth <= 0 || canvasHeight <= 0) {
			info(['Skipping update-drawing-area because canvas dimensions are zero/negative', {
				canvasWidth,
				canvasHeight,
				immediate,
				file: props.writingFile.path,
			}]);
			return;
		}

		info(['Computed Android drawing area update for writing overlay', {
			x: canvasX,
			y: canvasY,
			canvasWidth,
			canvasHeight,
			rawEmbedHeight: Math.round(embedRect.height),
			appWidth: windowWidth,
			appHeight: windowHeight,
			immediate,
			file: props.writingFile.path,
		}]);
		props.plugin.booxConnection.sendUpdateDrawingArea({
			x: canvasX,
			y: canvasY,
			canvasWidth,
			canvasHeight,
			appWidth: windowWidth,
			appHeight: windowHeight,
			immediate,
		});
	}

	function flushQueuedBooxStrokesAfterResize() {
		const queuedStrokePayloads = queuedBooxStrokePayloadsRef.current;
		queuedBooxStrokePayloadsRef.current = [];
		for (const queuedStrokePayload of queuedStrokePayloads) {
			if (createStrokeFromBoox(queuedStrokePayload) && queuedStrokePayload.strokeId !== undefined) {
				props.plugin.booxConnection.sendStrokeRendered(queuedStrokePayload.strokeId);
			}
		}
	}

	function createStrokeFromBoox(strokePayload: BooxStrokePayload | CanvasRelativeStrokePoint[]): boolean {
		const payload = Array.isArray(strokePayload)
			? { points: strokePayload }
			: strokePayload;
		const canvasRelativeStrokePoints = payload.points ?? [];
		if(!editorWrapperRefEl.current) {
			info(['BAIL: no wrapper ref', {
				strokeId: (strokePayload as BooxStrokePayload).strokeId,
				pointCount: canvasRelativeStrokePoints.length,
			}]);
			return false;
		}
		if(!tlEditorRef.current) {
			info(['BAIL: no tldraw editor ref', {
				strokeId: (strokePayload as BooxStrokePayload).strokeId,
				pointCount: canvasRelativeStrokePoints.length,
			}]);
			return false;
		}

		const currentTlBounds = tlEditorRef.current.getViewportPageBounds();
		const embedBounds = editorWrapperRefEl.current.getBoundingClientRect();
		const sourceCanvasWidth = payload.canvasWidth && payload.canvasWidth > 0 ? payload.canvasWidth : embedBounds.width;
		const sourceCanvasHeight = payload.canvasHeight && payload.canvasHeight > 0 ? payload.canvasHeight : embedBounds.height;
		// Compute how far the visible area is offset into the embed (for scroll compensation)
		const visibleTopOffsetPx = Math.max(0, -embedBounds.y);
		const visibleLeftOffsetPx = Math.max(0, -embedBounds.x);
		const pageYOffset = visibleTopOffsetPx / embedBounds.width * WRITING_PAGE_WIDTH;
		const pageXOffset = visibleLeftOffsetPx / embedBounds.width * WRITING_PAGE_WIDTH;
		const isReadonly = tlEditorRef.current.getInstanceState().isReadonly;
		info(['Creating Boox stroke in tldraw', {
			strokeId: (strokePayload as BooxStrokePayload).strokeId,
			pointCount: canvasRelativeStrokePoints.length,
			sourceCanvasWidth,
			sourceCanvasHeight,
			visibleTopOffsetPx,
			pageYOffset,
			tlBoundsX: currentTlBounds.x,
			tlBoundsY: currentTlBounds.y,
			tlBoundsW: currentTlBounds.w,
			tlBoundsH: currentTlBounds.h,
			embedWidth: embedBounds.width,
			embedHeight: embedBounds.height,
			isReadonlyBefore: isReadonly,
			isResizing: isAndroidDrawingAreaResizingRef.current,
			shapeCountBefore: tlEditorRef.current.getCurrentPageShapeIds().size,
		}]);
		const sourceTlBounds = new Box(
			currentTlBounds.x + pageXOffset,
			currentTlBounds.y + pageYOffset,
			WRITING_PAGE_WIDTH,
			sourceCanvasHeight / sourceCanvasWidth * WRITING_PAGE_WIDTH,
		);

		const xScaleCoeff = sourceTlBounds.w / sourceCanvasWidth;
		const yScaleCoeff = sourceTlBounds.h / sourceCanvasHeight;
		const tldrawStrokePoints = canvasRelativeStrokePoints.map( (canvasStrokePoint: CanvasRelativeStrokePoint) => ({
			x: sourceTlBounds.x + canvasStrokePoint.x * xScaleCoeff,
			y: sourceTlBounds.y + canvasStrokePoint.y * yScaleCoeff,
			z: canvasStrokePoint.pressure,
		}))

		pendingBooxStrokeCompletionsRef.current += 1;
		createTldrawStroke(tldrawStrokePoints);
		info(['Boox stroke creation completed', {
			strokeId: (strokePayload as BooxStrokePayload).strokeId,
			shapeCountAfter: tlEditorRef.current!.getCurrentPageShapeIds().size,
			isReadonlyAfter: tlEditorRef.current!.getInstanceState().isReadonly,
			pendingCompletions: pendingBooxStrokeCompletionsRef.current,
		}]);
		return true;
	}

	function createTldrawStroke(strokePoints: TldrawStrokePoint[]) {
		if(!tlEditorRef.current) return;
		verbose(["Creating writing stroke", strokePoints]);

		bypassReadonly(tlEditorRef.current, () => {
			tlEditorRef.current!.createShape({
				type: 'draw',
				props: {
					isPen: true,
					isComplete: true,
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

    async function fetchFileData() {
        const svg = await props.writingFile.vault.read(props.writingFile);
        if(svg) {
            const svgSettings = extractInkJsonFromSvg(svg);
            if(svgSettings && svgSettings.tldraw) {
                const snapshot = prepareWritingSnapshot(svgSettings.tldraw as TLEditorSnapshot);

                // Inject per-file lineHeight into tldraw document meta so shape utils can read
                // it from the editor at runtime. Old files without the attribute fall back to
                // the constant default (150), not the current setting — so existing embeds are
                // frozen at the height they were created with.
                const lineHeight = svgSettings.meta.writingLineHeight ?? WRITING_LINE_HEIGHT;
                const store = snapshot.document?.store as Record<string, unknown> | undefined;
                const documentRecord = store?.['document:document'] as Record<string, unknown> | undefined;
                if (store && documentRecord) {
                    store['document:document'] = {
                        ...documentRecord,
                        meta: { ...(documentRecord.meta as object), writingLineHeight: lineHeight },
                    };
                }

                setTlEditorSnapshot(snapshot);
            } else {
                logToVault('Writing file has no ink JSON: ' + props.writingFile.path);
            }
        } else {
            logToVault('Writing file unreadable: ' + props.writingFile.path);
        }
    }

};

/**
 * Moves the dedicated writing view camera vertically.
 * deltaScreenPx is in viewport pixels; camera y is page-space, so divide by zoom for 1:1 finger tracking
 * (same as drawing pan: setCamera y += dy / cz).
 */
function applyDedicatedWritingVerticalScroll(editor: Editor, deltaScreenPx: number) {
	const camera = editor.getCamera();
	editor.setCamera({
		x: camera.x,
		y: camera.y - deltaScreenPx / camera.z,
		z: camera.z,
	});
}

// (helpers removed; handled by FingerBlocker)

// (Reverted overlay helpers per v1-only change policy)



