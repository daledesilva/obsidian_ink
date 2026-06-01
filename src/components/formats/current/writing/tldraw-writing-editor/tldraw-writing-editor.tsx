import './tldraw-writing-editor.scss';
import * as React from 'react';
import { useRef } from 'react';
import { TFile } from 'obsidian';
import { Box } from '@tldraw/tldraw';
import { useAtomValue } from 'jotai';
import classNames from 'classnames';
import InkPlugin from 'src/main';
import { InkFileData } from 'src/components/formats/current/types/file-data';
import { buildInkCanvasWritingFileData } from 'src/components/formats/current/utils/build-file-data';
import { isInkCanvasFile } from 'src/components/formats/current/utils/ink-file-storage-engine';
import {
	WRITE_SHORT_DELAY_MS,
	WRITE_LONG_DELAY_MS,
	MENUBAR_HEIGHT_PX,
	WRITING_LINE_HEIGHT,
	WRITING_MIN_PAGE_HEIGHT,
	WRITING_PAGE_WIDTH,
} from 'src/constants';
import { clampWritingCameraY } from 'src/ink-canvas/camera';
import { createPanMomentumController, isTrackpadWheel, type PanMomentumController } from 'src/ink-canvas/pan-momentum';
import { PrimaryMenuBar } from 'src/components/jsx-components/primary-menu-bar/primary-menu-bar';
import { InkCanvasDrawingMenu } from 'src/components/jsx-components/drawing-menu/ink-canvas-drawing-menu';
import ExtendedWritingMenu from 'src/components/jsx-components/extended-writing-menu/extended-writing-menu';
import { type MenuOption } from 'src/components/jsx-components/overflow-menu/overflow-menu';
import { SecondaryMenuBar } from 'src/tldraw/secondary-menu-bar/secondary-menu-bar';
import { InkCanvasModifyMenu } from 'src/tldraw/modify-menu/ink-canvas-modify-menu';
import { ExpandLinesButton } from 'src/tldraw/expand-lines-button/expand-lines-button';
import { verbose } from 'src/logic/utils/universal-dev-logging';
import { logToVault } from 'src/logic/utils/log-to-vault';
import { restoreEmbedCmScrollerScroll } from 'src/logic/utils/restore-embed-cm-scroller-scroll';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { embedsInEditModeAtom, type WritingEditorControls } from '../writing-embed/writing-embed';
import { registerDedicatedInkEditor, unregisterDedicatedInkEditor } from 'src/logic/undo-redo/dedicated-ink-editor-registry';
import { register as registerInkEditor, unregister as unregisterInkEditor } from 'src/logic/undo-redo/ink-editor-registry';
import { initialize } from 'src/logic/undo-redo/unified-undo-stack';
import { InkSvgCanvas } from 'src/ink-canvas/ink-svg-canvas';
import { renderWritingStrokesToSvg, computeStrokesBounds } from 'src/ink-canvas/svg-export';
import { migrateWritingFromTldraw, type TldrawSnapshotForMigration } from 'src/ink-canvas/migrate-from-tldraw';
import {
	computeDedicatedWritingPageHeight,
	cropWritingStrokeHeightInvitingly,
	cropWritingStrokeHeightTightly,
	shouldResizeForNewHeight,
} from 'src/components/formats/current/utils/tldraw-helpers';
import { useDominantHand } from 'src/stores/dominant-hand-store';
import { Notice } from 'obsidian';
import { debug } from 'src/logic/utils/universal-dev-logging';
import type { InkCanvasEditor, InkCanvasSnapshot, InkStroke, InkPoint } from 'src/ink-canvas/types';
import { normalizeBooxPenPressureForCapture } from 'src/ink-canvas/constants/pen-input';
import { buildInkStrokeStyleForTreatAs } from 'src/ink-canvas/stroke-presets';
import { inkStrokeTimestampsFromBooxPoints } from 'src/ink-canvas/utils/stroke-timestamps';

///////////////////////////
///////////////////////////

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

interface TldrawWritingEditorProps {
	onResize?: (invitingBounds: Box, tightBounds: Box) => void;
	plugin: InkPlugin;
	workspaceLeafId: string;
	embedId?: string;
	writingFile: TFile;
	save: (inkFileData: InkFileData) => void;
	extendedMenu?: MenuOption[];
	embedded?: boolean;
	closeEditor?: () => void;
	saveControlsReference?: (controls: WritingEditorControls) => void;
	onOpenInDedicatedView?: () => void;
}

export const TldrawWritingEditorWrapper: React.FC<TldrawWritingEditorProps> = (props) => {
	const embedsInEditMode = useAtomValue(embedsInEditModeAtom);
	const editorActive = !!props.embedId && embedsInEditMode.has(props.embedId);
	if (editorActive) return <TldrawWritingEditor {...props} />;
	return <></>;
};

export function TldrawWritingEditor(props: TldrawWritingEditorProps) {
	const dominantHand = useDominantHand();
	const [initialSnapshot, setInitialSnapshot] = React.useState<InkCanvasSnapshot>();
	const [booxConnected, setBooxConnected] = React.useState(false);
	const resizePostProcessTimeoutRef = useRef<number>();
	const shortDelayTimerRef = useRef<number>();
	const longDelayTimerRef = useRef<number>();
	const editorRef = useRef<InkCanvasEditor>();
	const editorWrapperRefEl = useRef<HTMLDivElement>(null);
	const websocketConnectedRef = useRef(false);
	const [isBooxInputLocked, setIsBooxInputLocked] = React.useState(false);
	const activateWritingSessionRef = useRef<(() => void) | null>(null);
	const adjustThrottleRef = useRef<number | null>(null);
	const setBooxOverlayActiveTimerRef = useRef<number | null>(null);
	const isViewActiveRef = useRef(true);
	const pendingNewOverlayRef = useRef(false);
	const isAndroidDrawingAreaResizingRef = useRef(false);
	const queuedBooxStrokePayloadsRef = useRef<BooxStrokePayload[]>([]);
	const writingLineHeightRef = useRef(WRITING_LINE_HEIGHT);
	/** Applied embed/page inviting height — drives shouldResizeForNewHeight. */
	const curHeightRef = useRef<number | null>(null);
	/** When true, next page-height change bypasses Boox auto-resize skip (expand-lines button). */
	const forceNextPageHeightChangeRef = useRef(false);
	const dedicatedWritingScrollMomentumRef = useRef<PanMomentumController | null>(null);

	React.useEffect(() => {
		dedicatedWritingScrollMomentumRef.current = createPanMomentumController({ axis: 'y' });
		return () => dedicatedWritingScrollMomentumRef.current?.cancel();
	}, []);

	React.useEffect(() => {
		verbose('INK CANVAS WRITING EDITOR mounted');
		logToVault('Ink canvas writing editor mounted: ' + props.writingFile.path + (props.embedded ? ' [embed]' : ' [dedicated]'));
		void fetchFileData();
		return () => {
			verbose('INK CANVAS WRITING EDITOR unmounting');
			logToVault('Ink canvas writing editor unmounted: ' + props.writingFile.path);
		};
	}, []);

	React.useEffect(() => {
		return () => resetTimers();
	}, []);

	React.useEffect(() => {
		if (!initialSnapshot) return;
		if (!props.plugin.settings.booxConnectionEnabled) return;

		const { unregister, activate } = props.plugin.booxConnection.registerDrawingSession({
			onStrokeStart: () => {
				cancelDelayedBooxResizePostProcess();
			},
			onStroke: (strokeData: unknown) => {
				const payload = strokeData as BooxStrokePayload;
				const strokePayload: BooxStrokePayload = {
					strokeId: payload.strokeId,
					points: payload.points ?? (strokeData as BooxCanvasPoint[]),
					canvasWidth: payload.canvasWidth,
					canvasHeight: payload.canvasHeight,
				};
				if (isAndroidDrawingAreaResizingRef.current) {
					queuedBooxStrokePayloadsRef.current.push(strokePayload);
					return;
				}
				const created = createStrokeFromBoox(strokePayload);
				if (created && strokePayload.strokeId !== undefined) {
					props.plugin.booxConnection.sendStrokeRendered(strokePayload.strokeId);
				}
			},
			onDrawingAreaReady: () => {
				if (!isAndroidDrawingAreaResizingRef.current && queuedBooxStrokePayloadsRef.current.length === 0) return;
				isAndroidDrawingAreaResizingRef.current = false;
				flushQueuedBooxStrokesAfterResize();
			},
			onSocketOpen: () => {
				websocketConnectedRef.current = true;
				setBooxConnected(true);
				setIsBooxInputLocked(true);
				debug('Ink canvas writing: Connected to Boox companion app WebSocket');
				new Notice('Connected to Boox companion app');
				const sent = newAndroidDrawingArea();
				if (sent) {
					pendingNewOverlayRef.current = false;
					const editor = editorRef.current;
					if (editor) {
						props.plugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(editor));
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
					activateWritingSessionRef.current?.();
					const sent = newAndroidDrawingArea();
					if (sent) {
						pendingNewOverlayRef.current = false;
						const editor = editorRef.current;
						if (editor) props.plugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(editor));
					} else {
						pendingNewOverlayRef.current = true;
					}
				}, 0);
			},
		});
		activateWritingSessionRef.current = activate;

		return () => {
			websocketConnectedRef.current = false;
			setBooxConnected(false);
			setIsBooxInputLocked(false);
			pendingNewOverlayRef.current = false;
			isAndroidDrawingAreaResizingRef.current = false;
			queuedBooxStrokePayloadsRef.current = [];
			if (adjustThrottleRef.current) window.clearTimeout(adjustThrottleRef.current);
			if (setBooxOverlayActiveTimerRef.current) window.clearTimeout(setBooxOverlayActiveTimerRef.current);
			activateWritingSessionRef.current = null;
			unregister();
		};
	}, [initialSnapshot]);

	React.useEffect(() => {
		if (!initialSnapshot) return;
		if (!editorWrapperRefEl.current) return;
		if (!props.plugin.settings.booxConnectionEnabled) return;

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
					const editor = editorRef.current;
					if (editor) {
						props.plugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(editor));
					}
					return;
				}
				return;
			}
			if (websocketConnectedRef.current && isViewActiveRef.current) {
				sendAdjustmentImmediate();
			}
		});
		resizeObserver.observe(editorWrapperRefEl.current);
		return () => resizeObserver.disconnect();
	}, [initialSnapshot]);

	function getScrollContentBottomPageY(editor: InkCanvasEditor): number {
		const strokes = editor.getSnapshot().strokes;
		if (strokes.length === 0) return WRITING_MIN_PAGE_HEIGHT;
		return Math.max(computeStrokesBounds(strokes).maxY, WRITING_MIN_PAGE_HEIGHT);
	}

	function clampDedicatedWritingCamera(editor: InkCanvasEditor, cameraY: number): number {
		const container = editor.getContainerElement();
		const viewportHeightPx = container?.clientHeight ?? 0;
		const zoom = editor.getCamera().zoom;
		return clampWritingCameraY(
			cameraY,
			zoom,
			viewportHeightPx,
			getScrollContentBottomPageY(editor),
			MENUBAR_HEIGHT_PX,
		);
	}

	function applyDedicatedInkWritingVerticalScrollImmediate(deltaScreenPx: number): boolean {
		const editor = editorRef.current;
		if (!editor) return false;
		const camera = editor.getCamera();
		const newY = camera.y - deltaScreenPx / camera.zoom;
		const clampedY = clampDedicatedWritingCamera(editor, newY);
		const hitClamp = Math.abs(clampedY - camera.y) < 1e-9 && Math.abs(newY - clampedY) > 1e-9;
		editor.setCamera({
			x: camera.x,
			y: clampedY,
			zoom: camera.zoom,
		});
		return !hitClamp;
	}

	function releaseDedicatedWritingScrollMomentum() {
		dedicatedWritingScrollMomentumRef.current?.release((_deltaScreenX, deltaScreenY) =>
			applyDedicatedInkWritingVerticalScrollImmediate(deltaScreenY),
		);
	}

	function applyDedicatedInkWritingVerticalScroll(deltaScreenPx: number) {
		dedicatedWritingScrollMomentumRef.current?.recordScreenDelta(0, deltaScreenPx);
		applyDedicatedInkWritingVerticalScrollImmediate(deltaScreenPx);
	}

	// Dedicated view: capture-phase wheel so Obsidian does not steal vertical scroll
	React.useEffect(() => {
		if (!initialSnapshot) return;
		if (props.embedded) return;
		const wrapperEl = editorWrapperRefEl.current;
		if (!wrapperEl) return;

		const TRACKPAD_WHEEL_IDLE_MS = 80;
		let wheelIdleTimer: ReturnType<typeof setTimeout> | null = null;

		const clearTrackpadWheelIdleTimer = () => {
			if (wheelIdleTimer !== null) {
				clearTimeout(wheelIdleTimer);
				wheelIdleTimer = null;
			}
		};

		const onWheelScroll = (e: WheelEvent) => {
			e.preventDefault();
			e.stopPropagation();
			let deltaY = e.deltaY;
			if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) deltaY *= 16;
			if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) deltaY *= 600;
			if (isTrackpadWheel(e)) {
				clearTrackpadWheelIdleTimer();
				wheelIdleTimer = setTimeout(() => {
					wheelIdleTimer = null;
					releaseDedicatedWritingScrollMomentum();
				}, TRACKPAD_WHEEL_IDLE_MS);
			} else {
				clearTrackpadWheelIdleTimer();
				dedicatedWritingScrollMomentumRef.current?.cancel();
			}
			applyDedicatedInkWritingVerticalScroll(deltaY);
		};
		wrapperEl.addEventListener('wheel', onWheelScroll, { capture: true, passive: false });
		return () => {
			clearTrackpadWheelIdleTimer();
			wrapperEl.removeEventListener('wheel', onWheelScroll, { capture: true });
		};
	}, [initialSnapshot, props.embedded]);

	function handleEditorReady(editor: InkCanvasEditor) {
		editorRef.current = editor;
		const leafId = props.workspaceLeafId;

		if (props.embedded && props.embedId && leafId) {
			registerInkEditor(
				props.embedId,
				editor,
				editor.getContainerElement()!,
				leafId,
			);
			initialize(leafId, 0, editor.getUndoCount());
		}
		if (!props.embedded && leafId) {
			registerDedicatedInkEditor(leafId, editor);
		}

		if (editorWrapperRefEl.current) {
			editorWrapperRefEl.current.classList.remove('ddc_ink_editor-wrapper--loading');
		}

		if (props.saveControlsReference) {
			props.saveControlsReference({
				save: () => void completeSave(),
				saveAndHalt: async () => {
					await completeSave();
					unmountActions();
				},
				eraseAll: async () => {
					editor.eraseAll();
					await completeSave();
				},
				setBooxOverlayActive: (isActive) => {
					isViewActiveRef.current = isActive;
					if (!isActive) {
						pendingNewOverlayRef.current = false;
						props.plugin.booxConnection.sendCloseDrawingArea();
					} else {
						activateWritingSessionRef.current?.();
						const sent = newAndroidDrawingArea();
						if (!sent) pendingNewOverlayRef.current = true;
					}
				},
			});
		}

		if (props.plugin.settings.booxConnectionEnabled && props.plugin.booxConnection.isConnected()) {
			websocketConnectedRef.current = true;
			setBooxConnected(true);
			setIsBooxInputLocked(true);
			activateWritingSessionRef.current?.();
			newAndroidDrawingArea();
			const editor = editorRef.current;
			if (editor) {
				props.plugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(editor));
			}
		}

		if (props.embedded) {
			applyInitialEmbedSizing();
		} else {
			applyPageHeightChange(0, false);
		}
	}

	function getInvitingHeightFromEditor(editor: InkCanvasEditor): number {
		const lineHeight = writingLineHeightRef.current;
		const bufferLines = props.plugin.settings.writingBufferLines;
		const strokes = editor.getSnapshot().strokes;
		const contentHeight = strokes.length > 0
			? computeStrokesBounds(strokes).maxY
			: 0;
		return cropWritingStrokeHeightInvitingly(contentHeight, bufferLines, lineHeight);
	}

	function applyInitialEmbedSizing() {
		if (!props.embedded) return;

		const tryApply = (): boolean => {
			const editor = editorRef.current;
			const resizeContainer = editorWrapperRefEl.current?.closest('.ddc_ink_resize-container');
			if (!editor || !resizeContainer) return false;
			if (!resizeContainer.getBoundingClientRect().width) return false;
			applyPageHeightChange(0, true);
			return true;
		};

		requestAnimationFrame(() => {
			if (tryApply()) return;
			const resizeContainer = editorWrapperRefEl.current?.closest('.ddc_ink_resize-container');
			if (!resizeContainer) return;
			const observer = new ResizeObserver(() => {
				if (tryApply()) observer.disconnect();
			});
			observer.observe(resizeContainer);
		});
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
		if (props.embedded) {
			debouncedEmbedResizePostProcess();
		}
	}

	function cancelDelayedBooxResizePostProcess() {
		if (resizePostProcessTimeoutRef.current !== undefined) {
			window.clearTimeout(resizePostProcessTimeoutRef.current);
			resizePostProcessTimeoutRef.current = undefined;
		}
	}

	function debouncedEmbedResizePostProcess() {
		cancelDelayedBooxResizePostProcess();
		resizePostProcessTimeoutRef.current = window.setTimeout(() => {
			resizePostProcessTimeoutRef.current = undefined;
			const editor = editorRef.current;
			if (!editor || !props.embedded) return;
			if (websocketConnectedRef.current && props.plugin.settings.booxConnectionEnabled) return;
			const invitingHeight = getInvitingHeightFromEditor(editor);
			if (!shouldResizeForNewHeight(
				invitingHeight,
				curHeightRef.current,
				props.plugin.settings.writingBufferLines,
				writingLineHeightRef.current,
			)) return;
			curHeightRef.current = invitingHeight;
			editor.setWritingPageHeight(invitingHeight);
			notifyEmbedResize(invitingHeight);
		}, WRITE_SHORT_DELAY_MS);
	}

	function handlePageHeightChange(candidateHeightPx: number) {
		applyPageHeightChange(candidateHeightPx, false);
	}

	function applyPageHeightChange(candidateHeightPx: number, isInitialMount: boolean) {
		const editor = editorRef.current;
		if (!editor) return;

		const lineHeight = writingLineHeightRef.current;
		const bufferLines = props.plugin.settings.writingBufferLines;
		const invitingFromContent = getInvitingHeightFromEditor(editor);

		if (props.embedded) {
			const skipAutoResize = !forceNextPageHeightChangeRef.current
				&& websocketConnectedRef.current
				&& props.plugin.settings.booxConnectionEnabled;
			forceNextPageHeightChangeRef.current = false;
			if (skipAutoResize) return;

			if (isInitialMount) {
				const heightToApply = invitingFromContent;
				curHeightRef.current = heightToApply;
				editor.setWritingPageHeight(heightToApply);
				notifyEmbedResize(heightToApply);
				return;
			}

			const shouldResize = shouldResizeForNewHeight(
				candidateHeightPx,
				curHeightRef.current,
				bufferLines,
				lineHeight,
			);
			if (!shouldResize) return;

			curHeightRef.current = candidateHeightPx;
			editor.setWritingPageHeight(candidateHeightPx);
			notifyEmbedResize(candidateHeightPx);
			return;
		}

		// Dedicated view: grow page to cover viewport bottom + content (never shrink)
		const container = editor.getContainerElement();
		const viewportHeightPx = container?.clientHeight ?? 0;
		const camera = editor.getCamera();
		const targetHeight = computeDedicatedWritingPageHeight(
			camera.y,
			viewportHeightPx,
			camera.zoom,
			invitingFromContent,
			lineHeight,
		);
		if (targetHeight > editor.getPageHeight()) {
			editor.setWritingPageHeight(targetHeight);
			curHeightRef.current = targetHeight;
			const cam = editor.getCamera();
			editor.setCamera({
				x: cam.x,
				y: clampDedicatedWritingCamera(editor, cam.y),
				zoom: cam.zoom,
			});
		}
	}

	function notifyEmbedResize(pageHeight: number) {
		if (!props.embedded || !props.onResize) return;
		const pw = WRITING_PAGE_WIDTH;
		const invitingBounds = new Box(0, 0, pw, pageHeight);
		const strokes = editorRef.current?.getSnapshot().strokes ?? [];
		const lineHeight = writingLineHeightRef.current;
		const tightHeight = strokes.length > 0
			? cropWritingStrokeHeightTightly(computeStrokesBounds(strokes).maxY, lineHeight)
			: WRITING_MIN_PAGE_HEIGHT;
		const tightBounds = new Box(0, 0, pw, tightHeight);
		if (props.plugin.settings.booxConnectionEnabled && websocketConnectedRef.current) {
			isAndroidDrawingAreaResizingRef.current = true;
		}
		props.onResize(invitingBounds, tightBounds);
		sendAdjustmentImmediate();
	}

	function queueSaves() {
		resetTimers();
		shortDelayTimerRef.current = window.setTimeout(() => {
			void incrementalSave();
		}, WRITE_SHORT_DELAY_MS);
		longDelayTimerRef.current = window.setTimeout(() => {
			void completeSave();
		}, WRITE_LONG_DELAY_MS);
	}

	async function incrementalSave() {
		const editor = editorRef.current;
		if (!editor) return;
		verbose('incrementalSave (ink-canvas writing)');
		const snapshot = editor.getSnapshot();
		const svgString = renderWritingStrokesToSvg(snapshot.strokes, snapshot, WRITING_PAGE_WIDTH);
		props.save(buildInkCanvasWritingFileData({ inkCanvasSnapshot: snapshot, svgString }));
	}

	async function completeSave(): Promise<void> {
		const editor = editorRef.current;
		if (!editor) return;
		verbose('completeSave (ink-canvas writing)');
		const snapshot = editor.getSnapshot();
		const svgString = renderWritingStrokesToSvg(snapshot.strokes, snapshot, WRITING_PAGE_WIDTH);
		props.save(buildInkCanvasWritingFileData({ inkCanvasSnapshot: snapshot, svgString }));
	}

	function resetTimers() {
		cancelDelayedBooxResizePostProcess();
		window.clearTimeout(shortDelayTimerRef.current);
		window.clearTimeout(longDelayTimerRef.current);
	}

	async function fetchFileData() {
		const svg = await props.writingFile.vault.read(props.writingFile);
		const data = extractInkJsonFromSvg(svg);
		if (!data) return;

		let snapshot: InkCanvasSnapshot;
		if (isInkCanvasFile(data) && data.inkCanvas) {
			snapshot = data.inkCanvas;
		} else {
			const fallbackLineHeight = data.meta.writingLineHeight ?? WRITING_LINE_HEIGHT;
			snapshot = migrateWritingFromTldraw(
				data.tldraw as unknown as TldrawSnapshotForMigration,
				fallbackLineHeight,
			);
		}
		writingLineHeightRef.current = snapshot.writingLineHeight ?? WRITING_LINE_HEIGHT;
		setInitialSnapshot(snapshot);
	}

	function getEditor(): InkCanvasEditor | undefined {
		return editorRef.current;
	}

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

	function getMenuExcludeRects(wrapperEl: HTMLDivElement): Array<{ x: number; y: number; width: number; height: number }> {
		const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
		const menuBarEl = wrapperEl.querySelector('.ink_primary-menu-bar');
		if (menuBarEl) {
			const rect = menuBarEl.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				rects.push({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) });
			}
		}
		const secondaryBarEl = wrapperEl.querySelector('.ink_secondary-menu-bar');
		if (secondaryBarEl) {
			const rect = secondaryBarEl.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				rects.push({ x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) });
			}
		}
		return rects;
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

	function newAndroidDrawingArea(): boolean {
		if (!editorWrapperRefEl.current) return false;
		if (!props.plugin.settings.booxConnectionEnabled) return false;

		const embedRect = editorWrapperRefEl.current.getBoundingClientRect();
		const visible = clampToVisibleViewport(embedRect);
		if (visible.width <= 0 || visible.height <= 0) {
			pendingNewOverlayRef.current = true;
			return false;
		}
		pendingNewOverlayRef.current = false;

		props.plugin.booxConnection.sendNewDrawingArea({
			x: visible.x,
			y: visible.y,
			canvasWidth: visible.width,
			canvasHeight: visible.height,
			appWidth: window.innerWidth,
			appHeight: window.innerHeight,
			excludeRects: getMenuExcludeRects(editorWrapperRefEl.current),
		});
		return true;
	}

	function repositionBooxOverlayAfterEmbedGeometryChange() {
		restoreEmbedCmScrollerScroll(editorWrapperRefEl.current);
		if (!websocketConnectedRef.current || !isViewActiveRef.current) return;
		if (!props.plugin.settings.booxConnectionEnabled) return;

		if (props.embedded) {
			activateWritingSessionRef.current?.();
			const sent = newAndroidDrawingArea();
			if (sent) {
				pendingNewOverlayRef.current = false;
				const editor = editorRef.current;
				if (editor) {
					props.plugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(editor));
				}
			} else {
				pendingNewOverlayRef.current = true;
			}
			return;
		}
		sendAdjustment(false);
	}

	/** Throttled — scroll events (matches release_0.5 / Bridge docs). */
	function adjustAndroidDrawingAreaThrottled() {
		if (!isViewActiveRef.current) return;
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
		if (!props.plugin.settings.booxConnectionEnabled) return;

		const embedRect = editorWrapperRefEl.current.getBoundingClientRect();
		const visible = clampToVisibleViewport(embedRect);
		if (visible.width <= 0 || visible.height <= 0) {
			pendingNewOverlayRef.current = true;
			return;
		}
		pendingNewOverlayRef.current = false;

		props.plugin.booxConnection.sendUpdateDrawingArea({
			x: visible.x,
			y: visible.y,
			canvasWidth: visible.width,
			canvasHeight: visible.height,
			appWidth: window.innerWidth,
			appHeight: window.innerHeight,
			immediate,
			excludeRects: getMenuExcludeRects(editorWrapperRefEl.current),
		});
	}

	function getBooxStrokeSizeCssPx(editor: InkCanvasEditor): number {
		const BOOX_STROKE_SIZE_SCALE = 2;
		const style = editor.getStrokeStyle();
		const zoom = editor.getCamera().zoom;
		return style.size * zoom * BOOX_STROKE_SIZE_SCALE;
	}

	function handleBooxActivateTool(activatedTool: 'draw' | 'erase' | 'select') {
		if (!props.plugin.settings.booxConnectionEnabled) return;

		const isNonDrawTool = activatedTool === 'erase' || activatedTool === 'select';
		const isBooxConnected = props.plugin.booxConnection.isConnected();

		if (isNonDrawTool && websocketConnectedRef.current) {
			websocketConnectedRef.current = false;
			setBooxConnected(false);
			setIsBooxInputLocked(false);
			pendingNewOverlayRef.current = false;
			if (adjustThrottleRef.current) window.clearTimeout(adjustThrottleRef.current);
			props.plugin.booxConnection.sendCloseDrawingArea();
		} else if (activatedTool === 'draw' && !websocketConnectedRef.current) {
			if (isBooxConnected) {
				websocketConnectedRef.current = true;
				setBooxConnected(true);
				setIsBooxInputLocked(true);
				activateWritingSessionRef.current?.();
				const sent = newAndroidDrawingArea();
				if (sent) {
					pendingNewOverlayRef.current = false;
					const editor = editorRef.current;
					if (editor) {
						props.plugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(editor));
					}
				} else {
					pendingNewOverlayRef.current = true;
				}
			} else {
				void props.plugin.booxConnection.ensureConnected().catch((error) => {
					verbose(['BooxConnection: reconnect from writing draw tool failed', error]);
				});
			}
		}
	}

	function createStrokeFromBoox(strokePayload: BooxStrokePayload | BooxCanvasPoint[]): boolean {
		const payload = Array.isArray(strokePayload)
			? { points: strokePayload }
			: strokePayload;
		const canvasRelativePoints = payload.points ?? [];
		if (!editorWrapperRefEl.current) return false;
		const editor = editorRef.current;
		if (!editor) return false;

		const embedBounds = editorWrapperRefEl.current.getBoundingClientRect();
		const camera = editor.getCamera();
		const sourceCanvasWidth = payload.canvasWidth && payload.canvasWidth > 0
			? payload.canvasWidth
			: embedBounds.width;
		const sourceCanvasHeight = payload.canvasHeight && payload.canvasHeight > 0
			? payload.canvasHeight
			: embedBounds.height;
		if (sourceCanvasWidth <= 0 || sourceCanvasHeight <= 0) return false;

		const visibleTopOffsetPx = Math.max(0, -embedBounds.y);
		const visibleLeftOffsetPx = Math.max(0, -embedBounds.x);
		const pageYOffset = visibleTopOffsetPx / embedBounds.width * WRITING_PAGE_WIDTH;
		const pageXOffset = visibleLeftOffsetPx / embedBounds.width * WRITING_PAGE_WIDTH;
		const sourcePageBounds = {
			x: camera.x + pageXOffset,
			y: camera.y + pageYOffset,
			w: WRITING_PAGE_WIDTH,
			h: sourceCanvasHeight / sourceCanvasWidth * WRITING_PAGE_WIDTH,
		};
		const xScaleCoeff = sourcePageBounds.w / sourceCanvasWidth;
		const yScaleCoeff = sourcePageBounds.h / sourceCanvasHeight;

		const inkPoints: InkPoint[] = canvasRelativePoints.map(pt => [
			sourcePageBounds.x + pt.x * xScaleCoeff,
			sourcePageBounds.y + pt.y * yScaleCoeff,
			normalizeBooxPenPressureForCapture(pt.pressure),
		] as InkPoint);

		const stroke: InkStroke = {
			id: crypto.randomUUID(),
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

	function expandWritingLinesByOne() {
		const editor = editorRef.current;
		if (!editor) return;
		const lineHeight = writingLineHeightRef.current;
		const bufferLines = props.plugin.settings.writingBufferLines;
		const newHeight = editor.getPageHeight() + bufferLines * lineHeight;
		forceNextPageHeightChangeRef.current = true;
		curHeightRef.current = newHeight;
		editor.setWritingPageHeight(newHeight);
		notifyEmbedResize(newHeight);
	}

	if (!initialSnapshot) return <></>;

	return <>
		<div
			ref={editorWrapperRefEl}
			className={classNames([
				'ddc_ink_writing-editor',
				'ddc_ink_editor-wrapper--loading',
				!props.embedded && 'ddc_ink_dedicated-editor',
				dominantHand === 'left' && 'ink_dominant-hand_left',
			])}
			style={{ height: '100%', position: 'relative' }}
			tabIndex={props.embedded ? undefined : 0}
			onKeyDownCapture={(e) => {
				if (props.embedded) return;
				const editor = editorRef.current;
				if (!editor) return;
				const modKey = e.metaKey || e.ctrlKey;
				const key = (e.key ?? '').toLowerCase();
				if (modKey && !e.shiftKey && key === 'z') {
					e.preventDefault();
					editor.undo();
					return;
				}
				if (modKey && ((e.shiftKey && key === 'z') || key === 'y')) {
					e.preventDefault();
					editor.redo();
				}
			}}
		>
			<InkSvgCanvas
				initialSnapshot={initialSnapshot}
				writingMode={true}
				pageWidth={WRITING_PAGE_WIDTH}
				writingBufferLines={props.plugin.settings.writingBufferLines}
				onEditorReady={handleEditorReady}
				onChange={handleStoreChange}
				onPageHeightChange={handlePageHeightChange}
				onDedicatedVerticalTouchPan={
					props.embedded ? undefined : applyDedicatedInkWritingVerticalScroll
				}
				onPanGestureEnd={
					props.embedded ? undefined : releaseDedicatedWritingScrollMomentum
				}
				isEmbedded={props.embedded}
				isBooxInputLocked={isBooxInputLocked}
				blockObsidianPenGestures={props.embedded || isBooxInputLocked}
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
					onExpandClick={props.embedded ? props.onOpenInDedicatedView : undefined}
					embedId={props.embedded && props.embedId ? props.embedId : undefined}
					workspaceLeafId={props.embedded && props.workspaceLeafId ? props.workspaceLeafId : undefined}
					plugin={props.embedded ? props.plugin : undefined}
				/>
				{props.embedded && props.extendedMenu && (
					<ExtendedWritingMenu
						onLockClick={() => props.closeEditor?.()}
						menuOptions={props.extendedMenu}
					/>
				)}
				{!props.embedded && props.extendedMenu && (
					<ExtendedWritingMenu menuOptions={props.extendedMenu} />
				)}
			</PrimaryMenuBar>

			<SecondaryMenuBar>
				<InkCanvasModifyMenu
					getEditor={getEditor}
					onStoreChange={handleStoreChange}
				/>
				{props.embedded && booxConnected && (
					<ExpandLinesButton onExpandLines={expandWritingLinesByOne} />
				)}
			</SecondaryMenuBar>
		</div>
	</>;
}
