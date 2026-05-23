import './ink-canvas-drawing-editor.scss';
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
import { info, debug, inkDebugLog } from 'src/logic/utils/universal-dev-logging';
import { DEFAULT_STROKE_STYLE } from 'src/ink-canvas/types';
import type { InkCanvasEditor, InkCanvasSnapshot, InkStroke, InkPoint } from 'src/ink-canvas/types';
import type { TLEditorSnapshot } from '@tldraw/tldraw';

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

interface InkCanvasDrawingEditor_Props {
	onReady?: () => void;
	workspaceLeafId: string;
	embedId?: string;
	drawingFile: TFile;
	save: (pageData: InkFileData) => void;
	extendedMenu?: MenuOption[];

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

export const InkCanvasDrawingEditorWrapper: React.FC<InkCanvasDrawingEditor_Props> = (props) => {
	const embedsInEditMode = useAtomValue(embedsInEditModeAtom_v2);
	const editorActive = !!props.embedId && embedsInEditMode.has(props.embedId);

	if (editorActive) return <InkCanvasDrawingEditor {...props} />;
	return <></>;
};

export function InkCanvasDrawingEditor(props: InkCanvasDrawingEditor_Props) {

	const dominantHand = useDominantHand();
	const [initialSnapshot, setInitialSnapshot] = React.useState<InkCanvasSnapshot>();
	const shortDelayTimerRef = useRef<number>();
	const longDelayTimerRef = useRef<number>();
	const editorRef = useRef<InkCanvasEditor>();
	const editorWrapperRefEl = useRef<HTMLDivElement>(null);
	const websocketConnectedRef = useRef(false);
	const activateDrawingSessionRef = useRef<(() => void) | null>(null);
	const adjustThrottleRef = useRef<number | null>(null);
	const setBooxOverlayActiveTimerRef = useRef<number | null>(null);
	const isViewActiveRef = useRef(true);

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
				const payload = strokeData as {
					strokeId?: number;
					points?: BooxCanvasPoint[];
					canvasWidth?: number;
					canvasHeight?: number;
				};
				const points = payload.points ?? (strokeData as BooxCanvasPoint[]);
				if (createStrokeFromBoox(points, payload) && payload.strokeId !== undefined) {
					inkPlugin.booxConnection.sendStrokeRendered(payload.strokeId);
				}
			},
			onSocketOpen: () => {
				websocketConnectedRef.current = true;
				debug('Ink canvas: Connected to Boox companion app WebSocket');
				new Notice('Connected to Boox companion app');
				newAndroidDrawingArea();
				const inkPlugin = getGlobals().plugin;
				const editor = editorRef.current;
				if (editor) {
					const strokeSize = getBooxStrokeSizeCssPx(editor);
					inkPlugin.booxConnection.sendUpdateTool('draw', strokeSize);
				}
			},
			onReactivate: () => {
				if (!websocketConnectedRef.current) return;
				if (setBooxOverlayActiveTimerRef.current) window.clearTimeout(setBooxOverlayActiveTimerRef.current);
				setBooxOverlayActiveTimerRef.current = window.setTimeout(() => {
					setBooxOverlayActiveTimerRef.current = null;
					if (!websocketConnectedRef.current) return;
					activateDrawingSessionRef.current?.();
					newAndroidDrawingArea();
					const inkPlugin = getGlobals().plugin;
					const editor = editorRef.current;
					if (editor) inkPlugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(editor));
				}, 0);
			},
		});
		activateDrawingSessionRef.current = activate;

		return () => {
			websocketConnectedRef.current = false;
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

		const scrollEl = editorWrapperRefEl.current.closest('.cm-scroller')
			?? editorWrapperRefEl.current.closest('.workspace-leaf-content');
		if (!scrollEl) return;

		const onScroll = () => adjustAndroidDrawingArea();
		scrollEl.addEventListener('scroll', onScroll, { passive: true });
		return () => scrollEl.removeEventListener('scroll', onScroll);
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
						newAndroidDrawingArea();
					} else if (!isActive) {
						const inkPlugin = getGlobals().plugin;
						if (inkPlugin.settings.booxConnectionEnabled) {
							inkPlugin.booxConnection.sendCloseDrawingArea();
						}
					}
				},
			});
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


	// Boox bridge helpers
	///////////////////////////

	function getBooxSurfaceRect(): DOMRect | null {
		const el = editorWrapperRefEl.current;
		if (!el) return null;
		const rect = el.getBoundingClientRect();
		// Clamp to visible viewport
		const top = Math.max(rect.top, 0);
		const left = Math.max(rect.left, 0);
		const bottom = Math.min(rect.bottom, window.innerHeight);
		const right = Math.min(rect.right, window.innerWidth);
		const width = right - left;
		const height = bottom - top;
		if (width <= 0 || height <= 0) return null;
		return new DOMRect(left, top, width, height);
	}

	function buildBooxDrawingAreaPayload(): {
		x: number; y: number;
		canvasWidth: number; canvasHeight: number;
		appWidth: number; appHeight: number;
	} | null {
		const surfaceRect = getBooxSurfaceRect();
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

	function adjustAndroidDrawingArea() {
		if (adjustThrottleRef.current) window.clearTimeout(adjustThrottleRef.current);
		adjustThrottleRef.current = window.setTimeout(() => {
			adjustThrottleRef.current = null;
			if (!editorWrapperRefEl.current) return;
			if (!websocketConnectedRef.current) return;
			if (!isViewActiveRef.current) return;
			const inkPlugin = getGlobals().plugin;
			if (!inkPlugin.settings.booxConnectionEnabled) return;
			const payload = buildBooxDrawingAreaPayload();
			if (!payload) return;
			inkPlugin.booxConnection.sendUpdateDrawingArea(payload);
		}, 200);
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

		const surfaceRect = getBooxSurfaceRect();
		if (!surfaceRect) return false;

		const sourceCanvasWidth = (booxMeta?.canvasWidth && booxMeta.canvasWidth > 0)
			? booxMeta.canvasWidth
			: surfaceRect.width;
		const sourceCanvasHeight = (booxMeta?.canvasHeight && booxMeta.canvasHeight > 0)
			? booxMeta.canvasHeight
			: surfaceRect.height;

		if (sourceCanvasWidth <= 0 || sourceCanvasHeight <= 0) return false;

		info(['Boox ink-canvas stroke received', {
			strokeId: booxMeta?.strokeId,
			pointCount: canvasRelativePoints.length,
			canvasW: sourceCanvasWidth,
			canvasH: sourceCanvasHeight,
		}]);

		// Map Boox canvas-relative coordinates to page coordinates
		const inkPoints: InkPoint[] = canvasRelativePoints.map(pt => {
			const sx = surfaceRect.left + (pt.x / sourceCanvasWidth) * surfaceRect.width;
			const sy = surfaceRect.top + (pt.y / sourceCanvasHeight) * surfaceRect.height;
			const page = editor.screenToPage(sx, sy);
			return [page.x, page.y, pt.pressure] as InkPoint;
		});

		const strokeId = `boox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		const stroke: InkStroke = {
			id: strokeId,
			points: inkPoints,
			style: {
				...editor.getStrokeStyle(),
				simulatePressure: false, // Boox provides real pressure
			},
			offset: { x: 0, y: 0 },
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
				'ddc_ink_ink-canvas-editor',
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
				isEmbedded={props.embedded}
			/>

			<PrimaryMenuBar>
				<InkCanvasDrawingMenu
					getEditor={getEditor}
					onStoreChange={handleStoreChange}
					embedId={props.embedId}
					workspaceLeafId={props.workspaceLeafId}
					plugin={getGlobals().plugin}
				/>
				{props.embedded && (
					<ExtendedDrawingMenu
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
