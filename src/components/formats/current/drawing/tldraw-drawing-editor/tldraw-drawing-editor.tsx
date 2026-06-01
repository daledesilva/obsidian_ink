import './tldraw-drawing-editor.scss';
import * as React from 'react';
import { useRef } from 'react';
import { TFile } from 'obsidian';
import { useAtomValue } from 'jotai';
import classNames from 'classnames';
import { InkFileData } from 'src/components/formats/current/types/file-data';
import { buildInkCanvasDrawingFileData } from 'src/components/formats/current/utils/build-file-data';
import { DRAW_SHORT_DELAY_MS, DRAW_LONG_DELAY_MS, PLUGIN_VERSION } from 'src/constants';
import { PrimaryMenuBar } from 'src/components/jsx-components/primary-menu-bar/primary-menu-bar';
import { InkCanvasDrawingMenu } from 'src/components/jsx-components/drawing-menu/ink-canvas-drawing-menu';
import ExtendedDrawingMenu from 'src/components/jsx-components/extended-drawing-menu/extended-drawing-menu';
import { type MenuOption } from 'src/components/jsx-components/overflow-menu/overflow-menu';
import { SecondaryMenuBar } from 'src/tldraw/secondary-menu-bar/secondary-menu-bar';
import { InkCanvasModifyMenu } from 'src/tldraw/modify-menu/ink-canvas-modify-menu';
import { ResizeHandle } from 'src/components/jsx-components/resize-handle/resize-handle';
import { verbose } from 'src/logic/utils/universal-dev-logging';
import { logToVault } from 'src/logic/utils/log-to-vault';
import { restoreEmbedCmScrollerScroll } from 'src/logic/utils/restore-embed-cm-scroller-scroll';
import { getGlobals } from 'src/stores/global-store';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { embedsInEditModeAtom_v2, type DrawingEditorControls } from '../drawing-embed/drawing-embed';
import { registerDedicatedInkEditor, unregisterDedicatedInkEditor } from 'src/logic/undo-redo/dedicated-ink-editor-registry';
import { register as registerInkEditor, unregister as unregisterInkEditor } from 'src/logic/undo-redo/ink-editor-registry';
import { initialize } from 'src/logic/undo-redo/unified-undo-stack';
import { InkSvgCanvas } from 'src/ink-canvas/ink-svg-canvas';
import { renderStrokesToSvg } from 'src/ink-canvas/svg-export';
import { migrateFromTldraw } from 'src/ink-canvas/migrate-from-tldraw';
import { useDominantHand } from 'src/stores/dominant-hand-store';
import { Notice } from 'obsidian';
import { debug } from 'src/logic/utils/universal-dev-logging';
import type { InkCanvasEditor, InkCanvasSnapshot, InkStroke, InkPoint } from 'src/ink-canvas/types';
import { normalizeBooxPenPressureForCapture } from 'src/ink-canvas/constants/pen-input';
import { buildInkStrokeStyleForTreatAs } from 'src/ink-canvas/stroke-presets';
import { inkStrokeTimestampsFromBooxPoints } from 'src/ink-canvas/utils/stroke-timestamps';
import type { TLEditorSnapshot } from '@tldraw/tldraw';
import type { EmbedSettings } from 'src/types/embed-settings';

///////////////////////////
///////////////////////////

/** Stroke point received from the Boox eInk Bridge in canvas-relative coordinates. */
interface BooxCanvasPoint {
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
	points?: BooxCanvasPoint[];
	canvasWidth?: number;
	canvasHeight?: number;
}

interface TldrawDrawingEditor_Props {
	onReady?: () => void;
	workspaceLeafId: string;
	embedId?: string;
	drawingFile: TFile;
	save: (pageData: InkFileData) => void;
	extendedMenu?: MenuOption[];
	embedSettings?: EmbedSettings;
	onSaveCameraPosition?: (viewBox: { x: number; y: number; width: number; height: number }) => void;

	// For embeds
	embedded?: boolean;
	resizeEmbed?: (pxWidthDiff: number, pxHeightDiff: number) => void;
	onResizeStart?: () => void;
	onResizeEnd?: () => void;
	applyEmbedDimensions?: (width: number, aspectRatio: number) => void;
	closeEditor?: () => void;
	saveControlsReference?: (controls: DrawingEditorControls) => void;
	onOpenInDedicatedView?: () => void;
}

export const TldrawDrawingEditorWrapper: React.FC<TldrawDrawingEditor_Props> = (props) => {
	const embedsInEditMode = useAtomValue(embedsInEditModeAtom_v2);
	const editorActive = !!props.embedId && embedsInEditMode.has(props.embedId);

	if (editorActive) return <TldrawDrawingEditor {...props} />;
	return <></>;
};

export function TldrawDrawingEditor(props: TldrawDrawingEditor_Props) {

	const dominantHand = useDominantHand();
	const [initialSnapshot, setInitialSnapshot] = React.useState<InkCanvasSnapshot>();
	const shortDelayTimerRef = useRef<number>();
	const longDelayTimerRef = useRef<number>();
	const editorRef = useRef<InkCanvasEditor>();
	const editorWrapperRefEl = useRef<HTMLDivElement>(null);
	const websocketConnectedRef = useRef(false);
	const [isBooxInputLocked, setIsBooxInputLocked] = React.useState(false);
	const activateDrawingSessionRef = useRef<(() => void) | null>(null);
	const adjustThrottleRef = useRef<number | null>(null);
	const setBooxOverlayActiveTimerRef = useRef<number | null>(null);
	const isViewActiveRef = useRef(true);
	const pendingNewOverlayRef = useRef(false);
	const [, setCameraTick] = React.useState(0);

	// On mount
	React.useEffect(() => {
		verbose('INK CANVAS EDITOR mounted');
		logToVault('Ink canvas editor mounted: ' + props.drawingFile.path + (props.embedded ? ' [embed]' : ' [dedicated]'));
		void fetchFileData();
		return () => {
			verbose('INK CANVAS EDITOR unmounting');
			logToVault('Ink canvas editor unmounted: ' + props.drawingFile.path);
		};
	}, []);

	// Safety-net: clear timers on unmount
	React.useEffect(() => {
		return () => {
			resetTimers();
		};
	}, []);

	// Boox companion app: register drawing session while this editor is active.
	React.useEffect(() => {
		if (!initialSnapshot) return;
		const inkPlugin = getGlobals().plugin;
		if (!inkPlugin.settings.booxConnectionEnabled) return;

		const { unregister, activate } = inkPlugin.booxConnection.registerDrawingSession({
			onStroke: (strokeData: unknown) => {
				const payload = strokeData as BooxStrokePayload;
				const points = payload.points ?? (strokeData as BooxCanvasPoint[]);
				if (createStrokeFromBoox(points, payload) && payload.strokeId !== undefined) {
					inkPlugin.booxConnection.sendStrokeRendered(payload.strokeId);
				}
			},
			onSocketOpen: () => {
				websocketConnectedRef.current = true;
				setIsBooxInputLocked(true);
				debug('Ink canvas: Connected to Boox companion app WebSocket');
				new Notice('Connected to Boox companion app');
				const sent = newAndroidDrawingArea();
				if (sent) {
					pendingNewOverlayRef.current = false;
					const editor = editorRef.current;
					if (editor) {
						inkPlugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(editor));
					}
				} else {
					pendingNewOverlayRef.current = true;
				}
			},
			onReactivate: () => {
				if (!websocketConnectedRef.current) return;
				if (setBooxOverlayActiveTimerRef.current) window.clearTimeout(setBooxOverlayActiveTimerRef.current);
				setBooxOverlayActiveTimerRef.current = window.setTimeout(() => {
					setBooxOverlayActiveTimerRef.current = null;
					if (!websocketConnectedRef.current) return;
					activateDrawingSessionRef.current?.();
					const sent = newAndroidDrawingArea();
					if (sent) {
						pendingNewOverlayRef.current = false;
						const editor = editorRef.current;
						if (editor) inkPlugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(editor));
					} else {
						pendingNewOverlayRef.current = true;
					}
				}, 0);
			},
		});
		activateDrawingSessionRef.current = activate;

		return () => {
			websocketConnectedRef.current = false;
			setIsBooxInputLocked(false);
			pendingNewOverlayRef.current = false;
			if (adjustThrottleRef.current) window.clearTimeout(adjustThrottleRef.current);
			if (setBooxOverlayActiveTimerRef.current) window.clearTimeout(setBooxOverlayActiveTimerRef.current);
			activateDrawingSessionRef.current = null;
			unregister();
		};
	}, [initialSnapshot]);

	// Adjust Boox drawing area on page scroll
	React.useEffect(() => {
		if (!initialSnapshot) return;
		if (!editorWrapperRefEl.current) return;
		const inkPlugin = getGlobals().plugin;
		if (!inkPlugin.settings.booxConnectionEnabled) return;

		const scrollEl = editorWrapperRefEl.current.closest('.cm-scroller');
		if (!scrollEl) return;

		const onScroll = () => {
			if (!isViewActiveRef.current) return;
			restoreEmbedCmScrollerScroll(editorWrapperRefEl.current);
			adjustAndroidDrawingAreaThrottled();
		};
		scrollEl.addEventListener('scroll', onScroll, { passive: true });

		const visualViewport = typeof window !== 'undefined' ? window.visualViewport : null;
		const onVisualViewportChange = () => {
			if (!isViewActiveRef.current) return;
			restoreEmbedCmScrollerScroll(editorWrapperRefEl.current);
			adjustAndroidDrawingAreaThrottled();
		};
		visualViewport?.addEventListener('scroll', onVisualViewportChange);
		visualViewport?.addEventListener('resize', onVisualViewportChange);

		return () => {
			scrollEl.removeEventListener('scroll', onScroll);
			visualViewport?.removeEventListener('scroll', onVisualViewportChange);
			visualViewport?.removeEventListener('resize', onVisualViewportChange);
		};
	}, [initialSnapshot]);

	React.useEffect(() => {
		if (!initialSnapshot) return;
		if (!editorWrapperRefEl.current) return;

		const resizeObserver = new ResizeObserver(() => {
			if (pendingNewOverlayRef.current && isViewActiveRef.current && websocketConnectedRef.current) {
				const sent = newAndroidDrawingArea();
				if (sent) {
					pendingNewOverlayRef.current = false;
					const inkPlugin = getGlobals().plugin;
					const editor = editorRef.current;
					if (editor) {
						inkPlugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(editor));
					}
					return;
				}
				return;
			}
			if (websocketConnectedRef.current && isViewActiveRef.current) {
				adjustAndroidDrawingAreaThrottled();
			}
		});
		resizeObserver.observe(editorWrapperRefEl.current);
		return () => resizeObserver.disconnect();
	}, [initialSnapshot]);

	// Editor lifecycle
	///////////////////////////

	function handleEditorReady(editor: InkCanvasEditor) {
		editorRef.current = editor;
		const leafId = props.workspaceLeafId;

		// Register with undo system
		if (props.embedded && props.embedId && leafId) {
			registerInkEditor(
				props.embedId,
				editor,
				editor.getContainerElement()!,
				leafId,
				props.applyEmbedDimensions,
			);
			const undoCount = editor.getUndoCount();
			initialize(leafId, 0, undoCount);
		}
		if (!props.embedded && leafId) {
			registerDedicatedInkEditor(leafId, editor);
		}

		// Remove loading class
		if (editorWrapperRefEl.current) {
			editorWrapperRefEl.current.classList.remove('ddc_ink_editor-wrapper--loading');
		}

		// Register save controls
		if (props.saveControlsReference) {
			props.saveControlsReference({
				save: () => completeSave(),
				saveAndHalt: async (): Promise<void> => {
					await completeSave();
					unmountActions();
				},
				eraseAll: async (): Promise<void> => {
					editor.eraseAll();
					await completeSave();
				},
				setBooxOverlayActive: (isActive: boolean) => {
					isViewActiveRef.current = isActive;
					if (isActive && websocketConnectedRef.current) {
						activateDrawingSessionRef.current?.();
						const sent = newAndroidDrawingArea();
						if (!sent) pendingNewOverlayRef.current = true;
					} else if (!isActive) {
						pendingNewOverlayRef.current = false;
						const inkPlugin = getGlobals().plugin;
						if (inkPlugin.settings.booxConnectionEnabled) {
							inkPlugin.booxConnection.sendCloseDrawingArea();
						}
					}
				},
			});
		}

		// Socket may have opened before the canvas mounted (same as tldraw handleMount).
		const inkPlugin = getGlobals().plugin;
		if (inkPlugin.settings.booxConnectionEnabled && inkPlugin.booxConnection.isConnected()) {
			websocketConnectedRef.current = true;
			setIsBooxInputLocked(true);
			activateDrawingSessionRef.current?.();
			newAndroidDrawingArea();
			const editor = editorRef.current;
			if (editor) {
				inkPlugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(editor));
			}
		}

		if (props.onReady) props.onReady();
	}

	function unmountActions() {
		resetTimers();
		const leafId = props.workspaceLeafId;
		if (props.embedded && props.embedId) {
			unregisterInkEditor(props.embedId);
		}
		if (!props.embedded && leafId) {
			unregisterDedicatedInkEditor(leafId, editorRef.current!);
		}
	}

	function handleStoreChange() {
		queueSaves();
	}


	// Save pipeline
	///////////////////////////

	function queueSaves() {
		resetTimers();
		shortDelayTimerRef.current = window.setTimeout(() => {
			void incrementalSave();
		}, DRAW_SHORT_DELAY_MS);
		longDelayTimerRef.current = window.setTimeout(() => {
			void completeSave();
		}, DRAW_LONG_DELAY_MS);
	}

	async function incrementalSave() {
		const editor = editorRef.current;
		if (!editor) return;
		verbose('incrementalSave (ink-canvas)');
		logToVault('incrementalSave (ink-canvas drawing): ' + props.drawingFile.path);

		const snapshot = editor.getSnapshot();
		const svgString = renderStrokesToSvg(snapshot.strokes, snapshot);
		const fileData = buildInkCanvasDrawingFileData({
			inkCanvasSnapshot: snapshot,
			svgString,
		});
		props.save(fileData);
	}

	async function completeSave(): Promise<void> {
		const editor = editorRef.current;
		if (!editor) return;
		verbose('completeSave (ink-canvas)');
		logToVault('completeSave (ink-canvas drawing): ' + props.drawingFile.path);

		const snapshot = editor.getSnapshot();
		const svgString = renderStrokesToSvg(snapshot.strokes, snapshot);
		const fileData = buildInkCanvasDrawingFileData({
			inkCanvasSnapshot: snapshot,
			svgString,
		});
		props.save(fileData);
	}

	function resetTimers() {
		window.clearTimeout(shortDelayTimerRef.current);
		window.clearTimeout(longDelayTimerRef.current);
	}


	// File loading
	///////////////////////////

	async function fetchFileData() {
		const svg = await props.drawingFile.vault.read(props.drawingFile);
		if (!svg) {
			logToVault('Drawing file unreadable: ' + props.drawingFile.path);
			return;
		}

		const inkFileData = extractInkJsonFromSvg(svg);
		if (!inkFileData) {
			logToVault('Drawing file has no ink JSON: ' + props.drawingFile.path);
			return;
		}

		// If this is already an ink-canvas file, use its snapshot directly
		if (inkFileData.meta.format === 'ink-canvas' && inkFileData.inkCanvas) {
			setInitialSnapshot(inkFileData.inkCanvas);
			return;
		}

		// Otherwise migrate from tldraw format
		const migrated = migrateFromTldraw(inkFileData.tldraw as unknown as { store?: Record<string, any> });
		setInitialSnapshot(migrated);
	}


	// Getters
	///////////////////////////

	function getEditor(): InkCanvasEditor | undefined {
		return editorRef.current;
	}

	function computeCurrentViewBox(): { x: number; y: number; width: number; height: number } | null {
		const editor = editorRef.current;
		if (!editor) return null;
		const container = editor.getContainerElement();
		if (!container) return null;
		const rect = container.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return null;
		const camera = editor.getCamera();
		return {
			x: -camera.x,
			y: -camera.y,
			width: rect.width / camera.zoom,
			height: rect.height / camera.zoom,
		};
	}

	function isViewBoxDirty(): boolean {
		if (!props.embedded) return false;
		if (!props.embedSettings) return false;
		const vb = computeCurrentViewBox();
		if (!vb) return false;
		const saved = props.embedSettings.viewBox;
		const round3 = (n: number) => Math.round(n * 1000) / 1000;
		return (
			round3(vb.x) !== round3(saved.x) ||
			round3(vb.y) !== round3(saved.y) ||
			round3(vb.width) !== round3(saved.width) ||
			round3(vb.height) !== round3(saved.height)
		);
	}

	function handleSaveCameraPosition() {
		const vb = computeCurrentViewBox();
		if (!vb) return;
		props.onSaveCameraPosition?.(vb);
	}

	const customExtendedMenu = [
		{
			text: 'Grid on/off',
			action: () => {
				const editor = getEditor();
				if (editor) editor.setGridEnabled(!editor.isGridEnabled());
			},
		},
		...(props.extendedMenu || []),
	];


	// Resize
	///////////////////////////

	function resizeEmbed(pxWidthDiff: number, pxHeightDiff: number) {
		if (props.resizeEmbed) props.resizeEmbed(pxWidthDiff, pxHeightDiff);
	}


	// Boox bridge helpers (mirrors tldraw-drawing-editor; ink container instead of tldraw)
	///////////////////////////

	function computeClampDrawingSurfaceOverlay(surfaceRect: DOMRect): DOMRect {
		const innerW = window.innerWidth;
		const innerH = window.innerHeight;
		const visibleTop = Math.max(0, surfaceRect.y);
		const visibleBottom = Math.min(innerH, surfaceRect.y + surfaceRect.height);
		const visibleLeft = Math.max(0, surfaceRect.x);
		const visibleRight = Math.min(innerW, surfaceRect.x + surfaceRect.width);
		const width = Math.round(Math.max(0, visibleRight - visibleLeft));
		const height = Math.round(Math.max(0, visibleBottom - visibleTop));
		return new DOMRect(Math.round(visibleLeft), Math.round(visibleTop), width, height);
	}

	function getBooxDrawingSurfaceRects(): { raw: DOMRect; clamped: DOMRect | null } | null {
		const wrapper = editorWrapperRefEl.current;
		if (!wrapper) return null;
		let raw: DOMRect;
		if (props.embedded) {
			raw = wrapper.getBoundingClientRect();
		} else {
			const editor = editorRef.current;
			const container = editor?.getContainerElement();
			if (container) {
				const cr = container.getBoundingClientRect();
				raw = cr.width > 1 && cr.height > 1 ? cr : wrapper.getBoundingClientRect();
			} else {
				raw = wrapper.getBoundingClientRect();
			}
		}
		const clamped = computeClampDrawingSurfaceOverlay(raw);
		if (clamped.width <= 0 || clamped.height <= 0) {
			return { raw, clamped: null };
		}
		return { raw, clamped };
	}

	function getBooxClientAreaRect(): DOMRect | null {
		return getBooxDrawingSurfaceRects()?.clamped ?? null;
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

	function newAndroidDrawingArea(): boolean {
		if (!editorWrapperRefEl.current) return false;
		const inkPlugin = getGlobals().plugin;
		if (!inkPlugin.settings.booxConnectionEnabled) return false;

		const payload = buildBooxDrawingAreaPayload();
		if (!payload) return false;

		inkPlugin.booxConnection.sendNewDrawingArea(payload);
		return true;
	}

	/**
	 * Embeds: full new-drawing-area + update-tool (same path as pen-tool reactivation / lock-unlock).
	 * Dedicated view: throttled update-drawing-area (release_0.5 behaviour).
	 */
	function repositionBooxOverlayAfterEmbedGeometryChange() {
		restoreEmbedCmScrollerScroll(editorWrapperRefEl.current);
		if (!websocketConnectedRef.current || !isViewActiveRef.current) return;
		const inkPlugin = getGlobals().plugin;
		if (!inkPlugin.settings.booxConnectionEnabled) return;

		if (props.embedded) {
			activateDrawingSessionRef.current?.();
			const sent = newAndroidDrawingArea();
			if (sent) {
				pendingNewOverlayRef.current = false;
				const editor = editorRef.current;
				if (editor) {
					inkPlugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(editor));
				}
			} else {
				pendingNewOverlayRef.current = true;
			}
			return;
		}
		sendAdjustment(false);
	}

	/** Throttled — scroll and resize observer (matches release_0.5 / Bridge docs). */
	function adjustAndroidDrawingAreaThrottled() {
		if (adjustThrottleRef.current) window.clearTimeout(adjustThrottleRef.current);
		adjustThrottleRef.current = window.setTimeout(() => {
			adjustThrottleRef.current = null;
			repositionBooxOverlayAfterEmbedGeometryChange();
		}, 200);
	}

	function sendAdjustmentImmediate() {
		if (adjustThrottleRef.current) window.clearTimeout(adjustThrottleRef.current);
		adjustThrottleRef.current = window.setTimeout(() => {
			adjustThrottleRef.current = null;
			sendAdjustment(true);
		}, 50);
	}

	function sendAdjustment(immediate: boolean) {
		if (!editorWrapperRefEl.current) return;
		if (!websocketConnectedRef.current) return;
		if (!isViewActiveRef.current) return;
		const inkPlugin = getGlobals().plugin;
		if (!inkPlugin.settings.booxConnectionEnabled) return;

		const payload = buildBooxDrawingAreaPayload();
		if (!payload) return;

		inkPlugin.booxConnection.sendUpdateDrawingArea({
			...payload,
			immediate,
		});
	}

	function getBooxStrokeSizeCssPx(editor: InkCanvasEditor): number {
		const BOOX_STROKE_SIZE_SCALE = 2;
		const style = editor.getStrokeStyle();
		const zoom = editor.getCamera().zoom;
		return style.size * zoom * BOOX_STROKE_SIZE_SCALE;
	}

	function handleBooxActivateTool(activatedTool: 'draw' | 'erase' | 'select') {
		const inkPlugin = getGlobals().plugin;
		if (!inkPlugin.settings.booxConnectionEnabled) return;

		const isNonDrawTool = activatedTool === 'erase' || activatedTool === 'select';
		const isBooxConnected = inkPlugin.booxConnection.isConnected();

		if (isNonDrawTool && websocketConnectedRef.current) {
			websocketConnectedRef.current = false;
			setIsBooxInputLocked(false);
			pendingNewOverlayRef.current = false;
			if (adjustThrottleRef.current) window.clearTimeout(adjustThrottleRef.current);
			inkPlugin.booxConnection.sendCloseDrawingArea();
		} else if (activatedTool === 'draw' && !websocketConnectedRef.current) {
			if (isBooxConnected) {
				websocketConnectedRef.current = true;
				setIsBooxInputLocked(true);
				activateDrawingSessionRef.current?.();
				const sent = newAndroidDrawingArea();
				if (sent) {
					pendingNewOverlayRef.current = false;
					const editor = editorRef.current;
					if (editor) {
						inkPlugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(editor));
					}
				} else {
					pendingNewOverlayRef.current = true;
				}
			} else {
				void inkPlugin.booxConnection.ensureConnected().catch((error) => {
					verbose(['BooxConnection: reconnect from drawing draw tool failed', error]);
				});
			}
		}
	}

	function createStrokeFromBoox(
		canvasRelativePoints: BooxCanvasPoint[],
		booxMeta?: { strokeId?: number; canvasWidth?: number; canvasHeight?: number },
	): boolean {
		if (!editorWrapperRefEl.current) return false;
		const editor = editorRef.current;
		if (!editor) return false;

		const surfaceTriple = getBooxDrawingSurfaceRects();
		if (!surfaceTriple?.clamped) return false;
		const surfaceRect = surfaceTriple.clamped;

		const payloadCw = booxMeta?.canvasWidth;
		const payloadCh = booxMeta?.canvasHeight;
		const sourceCanvasWidth = payloadCw && payloadCw > 0 ? payloadCw : surfaceRect.width;
		const sourceCanvasHeight = payloadCh && payloadCh > 0 ? payloadCh : surfaceRect.height;
		if (sourceCanvasWidth <= 0 || sourceCanvasHeight <= 0) return false;

		const inkPoints: InkPoint[] = canvasRelativePoints.map(pt => {
			const sx = surfaceRect.left + (pt.x / sourceCanvasWidth) * surfaceRect.width;
			const sy = surfaceRect.top + (pt.y / sourceCanvasHeight) * surfaceRect.height;
			const page = editor.screenToPage(sx, sy);
			return [page.x, page.y, normalizeBooxPenPressureForCapture(pt.pressure)] as InkPoint;
		});

		const strokeId = `boox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const stroke: InkStroke = {
			id: strokeId,
			authoringSource: 'boox',
			points: inkPoints,
			style: {
				...buildInkStrokeStyleForTreatAs(editor.getStrokeStyle(), 'pen', editor.getCamera().zoom),
				simulatePressure: false,
			},
			offset: { x: 0, y: 0 },
			...inkStrokeTimestampsFromBooxPoints(canvasRelativePoints),
		};

		editor.addStroke(stroke);
		return true;
	}


	// Render
	///////////////////////////

	if (!initialSnapshot) return <></>;

	return <>
		<div
			ref={editorWrapperRefEl}
			className={classNames([
				'ddc_ink_drawing-editor',
				'ddc_ink_editor-wrapper--loading',
				!props.embedded && 'ddc_ink_dedicated-editor',
				dominantHand === 'left' && 'ink_dominant-hand_left',
			])}
			style={{ height: '100%', position: 'relative' }}
			tabIndex={props.embedded ? undefined : 0}
		>
			<InkSvgCanvas
				initialSnapshot={initialSnapshot}
				onEditorReady={handleEditorReady}
				onChange={handleStoreChange}
				onCameraChange={() => setCameraTick((n) => n + 1)}
				initialViewBox={props.embedded ? props.embedSettings?.viewBox : undefined}
				isEmbedded={props.embedded}
				isBooxInputLocked={isBooxInputLocked}
				blockObsidianPenGestures={!!props.embedded || isBooxInputLocked}
				onBooxEmbedGeometryChange={
					props.embedded && isBooxInputLocked
						? repositionBooxOverlayAfterEmbedGeometryChange
						: undefined
				}
			/>

			<PrimaryMenuBar>
				<InkCanvasDrawingMenu
					getEditor={getEditor}
					onStoreChange={handleStoreChange}
					onActivateTool={handleBooxActivateTool}
					embedId={props.embedId}
					workspaceLeafId={props.workspaceLeafId}
					plugin={getGlobals().plugin}
				/>
				{props.embedded && (
					<ExtendedDrawingMenu
						onSaveCameraClick={handleSaveCameraPosition}
						isSaveCameraEnabled={isViewBoxDirty()}
						onLockClick={() => props.closeEditor?.()}
						onExpandClick={() => props.onOpenInDedicatedView?.()}
						menuOptions={customExtendedMenu}
					/>
				)}
				{!props.embedded && (
					<ExtendedDrawingMenu menuOptions={customExtendedMenu} />
				)}
			</PrimaryMenuBar>

			<SecondaryMenuBar>
				<InkCanvasModifyMenu
					getEditor={getEditor}
					onStoreChange={handleStoreChange}
				/>
			</SecondaryMenuBar>

			{props.resizeEmbed && (
				<ResizeHandle
					resizeEmbed={resizeEmbed}
					onResizeStart={props.onResizeStart}
					onResizeEnd={props.onResizeEnd}
				/>
			)}
		</div>
	</>;
}
