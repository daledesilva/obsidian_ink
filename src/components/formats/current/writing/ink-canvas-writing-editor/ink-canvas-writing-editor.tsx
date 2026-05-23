import './ink-canvas-writing-editor.scss';
import * as React from 'react';
import { useRef } from 'react';
import { TFile } from 'obsidian';
import { Box } from '@tldraw/tldraw';
import { useAtomValue } from 'jotai';
import classNames from 'classnames';
import InkPlugin from 'src/main';
import { InkFileData } from 'src/components/formats/current/types/file-data';
import { buildInkCanvasWritingFileData } from 'src/components/formats/current/utils/build-file-data';
import {
	WRITE_SHORT_DELAY_MS,
	WRITE_LONG_DELAY_MS,
	MENUBAR_HEIGHT_PX,
	WRITING_LINE_HEIGHT,
	WRITING_MIN_PAGE_HEIGHT,
	WRITING_PAGE_WIDTH,
} from 'src/constants';
import { clampWritingCameraY } from 'src/ink-canvas/camera';
import { PrimaryMenuBar } from 'src/components/jsx-components/primary-menu-bar/primary-menu-bar';
import { InkCanvasDrawingMenu } from 'src/components/jsx-components/drawing-menu/ink-canvas-drawing-menu';
import ExtendedWritingMenu from 'src/components/jsx-components/extended-writing-menu/extended-writing-menu';
import { type MenuOption } from 'src/components/jsx-components/overflow-menu/overflow-menu';
import { SecondaryMenuBar } from 'src/tldraw/secondary-menu-bar/secondary-menu-bar';
import { InkCanvasModifyMenu } from 'src/tldraw/modify-menu/ink-canvas-modify-menu';
import { ExpandLinesButton } from 'src/tldraw/expand-lines-button/expand-lines-button';
import { verbose } from 'src/logic/utils/universal-dev-logging';
import { logToVault } from 'src/logic/utils/log-to-vault';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { embedsInEditModeAtom, type WritingEditorControls } from '../writing-embed/writing-embed';
import { registerDedicatedInkEditor, unregisterDedicatedInkEditor } from 'src/logic/undo-redo/dedicated-ink-editor-registry';
import { register as registerInkEditor, unregister as unregisterInkEditor } from 'src/logic/undo-redo/ink-editor-registry';
import { initialize } from 'src/logic/undo-redo/unified-undo-stack';
import { InkSvgCanvas } from 'src/ink-canvas/ink-svg-canvas';
import { renderWritingStrokesToSvg, computeStrokesBounds } from 'src/ink-canvas/svg-export';
import { migrateWritingFromTldraw } from 'src/ink-canvas/migrate-from-tldraw';
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

interface InkCanvasWritingEditorProps {
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

export const InkCanvasWritingEditorWrapper: React.FC<InkCanvasWritingEditorProps> = (props) => {
	const embedsInEditMode = useAtomValue(embedsInEditModeAtom);
	const editorActive = !!props.embedId && embedsInEditMode.has(props.embedId);
	if (editorActive) return <InkCanvasWritingEditor {...props} />;
	return <></>;
};

export function InkCanvasWritingEditor(props: InkCanvasWritingEditorProps) {
	const dominantHand = useDominantHand();
	const [initialSnapshot, setInitialSnapshot] = React.useState<InkCanvasSnapshot>();
	const [booxConnected, setBooxConnected] = React.useState(false);
	const shortDelayTimerRef = useRef<number>();
	const longDelayTimerRef = useRef<number>();
	const editorRef = useRef<InkCanvasEditor>();
	const editorWrapperRefEl = useRef<HTMLDivElement>(null);
	const websocketConnectedRef = useRef(false);
	const activateWritingSessionRef = useRef<(() => void) | null>(null);
	const adjustThrottleRef = useRef<number | null>(null);
	const setBooxOverlayActiveTimerRef = useRef<number | null>(null);
	const isViewActiveRef = useRef(true);
	const writingLineHeightRef = useRef(WRITING_LINE_HEIGHT);
	/** Applied embed/page inviting height — drives shouldResizeForNewHeight. */
	const curHeightRef = useRef<number | null>(null);
	/** When true, next page-height change bypasses Boox auto-resize skip (expand-lines button). */
	const forceNextPageHeightChangeRef = useRef(false);

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
			onStroke: (strokeData: unknown) => {
				const payload = strokeData as {
					strokeId?: number;
					points?: BooxCanvasPoint[];
					canvasWidth?: number;
					canvasHeight?: number;
				};
				const points = payload.points ?? (strokeData as BooxCanvasPoint[]);
				if (createStrokeFromBoox(points, payload) && payload.strokeId !== undefined) {
					props.plugin.booxConnection.sendStrokeRendered(payload.strokeId);
				}
			},
			onSocketOpen: () => {
				websocketConnectedRef.current = true;
				setBooxConnected(true);
				debug('Ink canvas writing: Connected to Boox companion app WebSocket');
				new Notice('Connected to Boox companion app');
				newAndroidDrawingArea();
				const editor = editorRef.current;
				if (editor) {
					props.plugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(editor));
				}
			},
			onReactivate: () => {
				if (!websocketConnectedRef.current) return;
				if (setBooxOverlayActiveTimerRef.current) window.clearTimeout(setBooxOverlayActiveTimerRef.current);
				setBooxOverlayActiveTimerRef.current = window.setTimeout(() => {
					setBooxOverlayActiveTimerRef.current = null;
					if (!websocketConnectedRef.current) return;
					activateWritingSessionRef.current?.();
					newAndroidDrawingArea();
					const editor = editorRef.current;
					if (editor) props.plugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(editor));
				}, 0);
			},
		});
		activateWritingSessionRef.current = activate;

		return () => {
			websocketConnectedRef.current = false;
			setBooxConnected(false);
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

		const scrollEl = editorWrapperRefEl.current.closest('.cm-scroller')
			?? editorWrapperRefEl.current.closest('.workspace-leaf-content');
		if (!scrollEl) return;

		const onScroll = () => sendAdjustmentImmediate();
		scrollEl.addEventListener('scroll', onScroll, { passive: true });
		return () => scrollEl.removeEventListener('scroll', onScroll);
	}, [initialSnapshot]);

	React.useEffect(() => {
		if (!initialSnapshot) return;
		if (!editorWrapperRefEl.current) return;

		const resizeObserver = new ResizeObserver(() => {
			if (websocketConnectedRef.current && isViewActiveRef.current) {
				sendAdjustmentImmediate();
			}
		});
		resizeObserver.observe(editorWrapperRefEl.current);
		return () => resizeObserver.disconnect();
	}, [initialSnapshot]);

	// Dedicated view: capture-phase wheel so Obsidian does not steal vertical scroll
	React.useEffect(() => {
		if (!initialSnapshot) return;
		if (props.embedded) return;
		const wrapperEl = editorWrapperRefEl.current;
		if (!wrapperEl) return;

		const onWheelScroll = (e: WheelEvent) => {
			e.preventDefault();
			e.stopPropagation();
			let deltaY = e.deltaY;
			if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) deltaY *= 16;
			if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) deltaY *= 600;
			applyDedicatedInkWritingVerticalScroll(deltaY);
		};
		wrapperEl.addEventListener('wheel', onWheelScroll, { capture: true, passive: false });
		return () => wrapperEl.removeEventListener('wheel', onWheelScroll, { capture: true });
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
						props.plugin.booxConnection.sendCloseDrawingArea();
					} else {
						activateWritingSessionRef.current?.();
						newAndroidDrawingArea();
					}
				},
			});
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
		props.onResize(invitingBounds, tightBounds);
		sendAdjustmentImmediate();
	}

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

	function applyDedicatedInkWritingVerticalScroll(deltaScreenPx: number) {
		const editor = editorRef.current;
		if (!editor) return;
		const camera = editor.getCamera();
		const newY = camera.y - deltaScreenPx / camera.zoom;
		editor.setCamera({
			x: camera.x,
			y: clampDedicatedWritingCamera(editor, newY),
			zoom: camera.zoom,
		});
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
		window.clearTimeout(shortDelayTimerRef.current);
		window.clearTimeout(longDelayTimerRef.current);
	}

	async function fetchFileData() {
		const svg = await props.writingFile.vault.read(props.writingFile);
		const data = extractInkJsonFromSvg(svg);
		if (!data) return;

		let snapshot: InkCanvasSnapshot;
		if (data.meta.format === 'ink-canvas' && data.inkCanvas) {
			snapshot = data.inkCanvas;
		} else {
			const fallbackLineHeight = data.meta.writingLineHeight ?? WRITING_LINE_HEIGHT;
			snapshot = migrateWritingFromTldraw(
				data.tldraw as unknown as { store?: Record<string, unknown> },
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

	function newAndroidDrawingArea(): boolean {
		if (!editorWrapperRefEl.current) return false;
		if (!props.plugin.settings.booxConnectionEnabled) return false;

		const embedRect = editorWrapperRefEl.current.getBoundingClientRect();
		const visible = clampToVisibleViewport(embedRect);
		if (visible.width <= 0 || visible.height <= 0) return false;

		props.plugin.booxConnection.sendNewDrawingArea({
			x: visible.x,
			y: visible.y,
			canvasWidth: visible.width,
			canvasHeight: visible.height,
			appWidth: window.innerWidth,
			appHeight: window.innerHeight,
		});
		return true;
	}

	function sendAdjustmentImmediate() {
		if (adjustThrottleRef.current) window.clearTimeout(adjustThrottleRef.current);
		adjustThrottleRef.current = window.setTimeout(() => {
			adjustThrottleRef.current = null;
			if (!editorWrapperRefEl.current) return;
			if (!websocketConnectedRef.current) return;
			if (!isViewActiveRef.current) return;
			if (!props.plugin.settings.booxConnectionEnabled) return;

			const embedRect = editorWrapperRefEl.current.getBoundingClientRect();
			const visible = clampToVisibleViewport(embedRect);
			if (visible.width <= 0 || visible.height <= 0) return;

			props.plugin.booxConnection.sendUpdateDrawingArea({
				x: visible.x,
				y: visible.y,
				canvasWidth: visible.width,
				canvasHeight: visible.height,
				appWidth: window.innerWidth,
				appHeight: window.innerHeight,
				immediate: true,
			});
		}, 50);
	}

	function getBooxStrokeSizeCssPx(editor: InkCanvasEditor): number {
		const BOOX_STROKE_SIZE_SCALE = 2;
		const style = editor.getStrokeStyle();
		const zoom = editor.getCamera().zoom;
		return style.size * zoom * BOOX_STROKE_SIZE_SCALE;
	}

	function createStrokeFromBoox(
		canvasRelativePoints: BooxCanvasPoint[],
		booxMeta?: { strokeId?: number; canvasWidth?: number; canvasHeight?: number },
	): boolean {
		if (!editorWrapperRefEl.current) return false;
		const editor = editorRef.current;
		if (!editor) return false;

		const rect = editorWrapperRefEl.current.getBoundingClientRect();
		const sourceCanvasWidth = (booxMeta?.canvasWidth && booxMeta.canvasWidth > 0)
			? booxMeta.canvasWidth
			: rect.width;
		const sourceCanvasHeight = (booxMeta?.canvasHeight && booxMeta.canvasHeight > 0)
			? booxMeta.canvasHeight
			: rect.height;
		if (sourceCanvasWidth <= 0 || sourceCanvasHeight <= 0) return false;

		const inkPoints: InkPoint[] = canvasRelativePoints.map(pt => {
			const sx = rect.left + (pt.x / sourceCanvasWidth) * rect.width;
			const sy = rect.top + (pt.y / sourceCanvasHeight) * rect.height;
			const page = editor.screenToPage(sx, sy);
			return [page.x, page.y, pt.pressure] as InkPoint;
		});

		const stroke: InkStroke = {
			id: crypto.randomUUID(),
			points: inkPoints,
			style: {
				...editor.getStrokeStyle(),
				simulatePressure: false,
			},
			offset: { x: 0, y: 0 },
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
				'ddc_ink_ink-canvas-writing-editor',
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
				isEmbedded={props.embedded}
			/>

			<PrimaryMenuBar>
				<InkCanvasDrawingMenu
					getEditor={getEditor}
					onStoreChange={handleStoreChange}
					embedId={props.embedded && props.embedId ? props.embedId : undefined}
					workspaceLeafId={props.embedded && props.workspaceLeafId ? props.workspaceLeafId : undefined}
					plugin={props.embedded ? props.plugin : undefined}
				/>
				{props.embedded && props.extendedMenu && (
					<ExtendedWritingMenu
						onLockClick={() => props.closeEditor?.()}
						onExpandClick={props.onOpenInDedicatedView}
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
