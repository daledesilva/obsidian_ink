import './tldraw-drawing-editor.scss';
import { DefaultSizeStyle, Editor, TLUiOverrides, TldrawEditor, TldrawHandles, TldrawOptions, TldrawScribble, TldrawSelectionBackground, TldrawSelectionForeground, TldrawShapeIndicators, Vec, defaultShapeTools, defaultShapeUtils, defaultTools, getSnapshot, TLEditorSnapshot, TLEventInfo } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, adaptTldrawToObsidianThemeMode, focusChildTldrawEditor, getActivityType, getDrawingSvg, initDrawingCamera, prepareDrawingSnapshot, preventTldrawCanvasesCausingObsidianGestures } from "src/components/formats/v1-code-blocks/utils/tldraw-helpers";
import { lockTldrawInput, unlockTldrawInput, bypassReadonly } from "src/components/formats/current/utils/tldraw-helpers";
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
import { debug, verbose, warn } from 'src/logic/utils/log-to-console';
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
	React.useEffect(() => {
		if (!tlEditorSnapshot) return;
		const inkPlugin = getGlobals().plugin;
		if (!inkPlugin.settings.booxConnectionEnabled) return;

		const unregister = inkPlugin.booxConnection.registerDrawingSession({
			onStroke: (strokePoints: unknown) => {
				const payload = strokePoints as { points?: CanvasRelativeStrokePoint[] };
				const points = payload.points ?? (strokePoints as CanvasRelativeStrokePoint[]);
				createStrokeFromBoox(points);
			},
			onSocketOpen: () => {
				websocketConnectedRef.current = true;
				if (tlEditorRef.current) lockTldrawInput(tlEditorRef.current);
				debug('Connected to Boox companion app WebSocket');
				new Notice('Connected to Boox companion app');
				newAndroidDrawingArea();
				const inkPlugin = getGlobals().plugin;
				if (tlEditorRef.current) inkPlugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(tlEditorRef.current));
			},
		});

		return () => {
			websocketConnectedRef.current = false;
			if (tlEditorRef.current) unlockTldrawInput(tlEditorRef.current);
			if (adjustThrottleRef.current) clearTimeout(adjustThrottleRef.current);
			inkPlugin.booxConnection.sendCloseDrawingArea();
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

	// Adjust drawing area on embed resize
	React.useEffect(() => {
		if (!tlEditorSnapshot) return;
		if (!editorWrapperRefEl.current) return;

		const resizeObserver = new ResizeObserver(() => {
			adjustAndroidDrawingArea();
		});

		resizeObserver.observe(editorWrapperRefEl.current);

		return () => {
			resizeObserver.disconnect();
		};
	}, [tlEditorSnapshot])

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
		const leafId = props.workspaceLeafId;
		if (!props.embedded && leafId) {
			registerDedicatedInkEditor(leafId, editor);
		}
		focusChildTldrawEditor(editorWrapperRefEl.current);
		preventTldrawCanvasesCausingObsidianGestures(editor);

		// Pan/zoom event listener cleanup functions
		const panZoomCleanupFns: Array<() => void> = [];

		// Dedicated-view pan/zoom listeners
		if (!props.embedded) {
			const wrapperEl = editorWrapperRefEl.current;
			const tlContainer = editor.getContainer();

			// Mod+wheel zoom
			if (wrapperEl) {
				const wheelHandler = (e: WheelEvent) => {
					if (e.metaKey || e.ctrlKey) {
						e.preventDefault();
						e.stopPropagation();
						// zoomIn/zoomOut expects screen-space coordinates (not page-space)
						const containerRect = tlContainer.getBoundingClientRect();
						const screenPoint = new Vec(e.clientX - containerRect.left, e.clientY - containerRect.top);
						if (e.deltaY < 0) {
							console.log('[drawing pan/zoom] Mod+wheel zoom IN', { screenPoint, deltaY: e.deltaY, mod: e.metaKey ? 'meta' : 'ctrl' });
							editor.zoomIn(screenPoint, { animation: { duration: 0 } });
						} else {
							console.log('[drawing pan/zoom] Mod+wheel zoom OUT', { screenPoint, deltaY: e.deltaY, mod: e.metaKey ? 'meta' : 'ctrl' });
							editor.zoomOut(screenPoint, { animation: { duration: 0 } });
						}
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
				const cam = editor.getCamera();
				editor.setCamera({ x: cam.x + dx, y: cam.y + dy, z: cam.z });
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
		}

		// Two-finger pinch zoom in embeds: temporarily unlock camera during multi-touch
		if (props.embedded) {
			const tlCanvas = editor.getContainer().querySelector('.tl-canvas') as HTMLElement | null;
			console.log('[drawing pan/zoom] embed: setting up touch listeners, tlCanvas found:', !!tlCanvas);
			if (tlCanvas) {
				const onTouchStart = (e: TouchEvent) => {
					console.log('[drawing pan/zoom] embed touchstart, touches:', e.touches.length);
					if (e.touches.length >= 2) {
						console.log('[drawing pan/zoom] embed: 2+ fingers — unlocking camera');
						editor.setCameraOptions({ isLocked: false });
					}
				};
				const onTouchEnd = (e: TouchEvent) => {
					console.log('[drawing pan/zoom] embed touchend/touchcancel, remaining touches:', e.touches.length);
					if (e.touches.length < 2) {
						console.log('[drawing pan/zoom] embed: <2 fingers — re-locking camera');
						editor.setCameraOptions({ isLocked: true });
					}
				};
				tlCanvas.addEventListener('touchstart', onTouchStart, { passive: true });
				tlCanvas.addEventListener('touchend', onTouchEnd, { passive: true });
				tlCanvas.addEventListener('touchcancel', onTouchEnd, { passive: true });
				panZoomCleanupFns.push(() => {
					tlCanvas.removeEventListener('touchstart', onTouchStart);
					tlCanvas.removeEventListener('touchend', onTouchEnd);
					tlCanvas.removeEventListener('touchcancel', onTouchEnd);
				});
			}
		}

		// tldraw content setup
		adaptTldrawToObsidianThemeMode(editor);
		editor.updateInstanceState({
			isGridMode: true,
		})
		
		// view setup
		initDrawingCamera(editor);
		if (props.embedded) {
			editor.setCameraOptions({
				isLocked: true,
			})
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
				clearAll: async (): Promise<void> => {
					const allShapeIds = [...editor.getCurrentPageShapeIds()];
					editor.deleteShapes(allShapeIds);
					await completeSave(editor);
				},
			})
		}
		
		if(props.onReady) props.onReady();

		return () => {
			unmountActions();
		};
	}

	// Helper functions
	///////////////////

    async function fetchFileData() {
		const svg = await props.drawingFile.vault.read(props.drawingFile);
        if(svg) {
			const svgSettings = extractInkJsonFromSvg(svg);
			if(svgSettings) {
				const snapshot = prepareDrawingSnapshot(svgSettings.tldraw);
				setTlEditorSnapshot(snapshot);
			} else {
				logToVault('Drawing file has no ink JSON: ' + props.drawingFile.path);
			}
        } else {
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
			/>
			
			<PrimaryMenuBar>
			<DrawingMenu
				getTlEditor = {getTlEditor}
				onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
				onActivateTool = {(activatedTool) => {
					const inkPlugin = getGlobals().plugin;
					const isNonDrawTool = activatedTool === 'eraser' || activatedTool === 'select';
					if (isNonDrawTool && websocketConnectedRef.current) {
						websocketConnectedRef.current = false;
						if (tlEditorRef.current) unlockTldrawInput(tlEditorRef.current);
						inkPlugin.booxConnection.sendCloseDrawingArea();
					} else if (activatedTool === 'draw' && !websocketConnectedRef.current && inkPlugin.booxConnection.isConnected()) {
						websocketConnectedRef.current = true;
						if (tlEditorRef.current) lockTldrawInput(tlEditorRef.current);
						newAndroidDrawingArea();
						if (tlEditorRef.current) {
							inkPlugin.booxConnection.sendUpdateTool('draw', getBooxStrokeSizeCssPx(tlEditorRef.current))
						};
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


	function newAndroidDrawingArea() {
		if(!editorWrapperRefEl.current) return;

		const inkPlugin = getGlobals().plugin;
		if (!inkPlugin.settings.booxConnectionEnabled) return;

		const windowWidth = window.innerWidth;
		const windowHeight = window.innerHeight;

		// Define size and position of drawing canvas
		const embedRect = editorWrapperRefEl.current.getBoundingClientRect();
		const canvasX = Math.round(embedRect.x);
		const canvasY = Math.round(embedRect.y);
		const canvasWidth = Math.round(embedRect.width);
		const canvasHeight = Math.round(embedRect.height);

		// drawCanvasDebugOverlays({ rect: { x: canvasX, y: canvasY, width: canvasWidth, height: canvasHeight } });

		inkPlugin.booxConnection.sendNewDrawingArea({
			x: canvasX,
			y: canvasY,
			canvasWidth: canvasWidth,
			canvasHeight: canvasHeight,
			appWidth: windowWidth,
			appHeight: windowHeight,
		});
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

		const inkPlugin = getGlobals().plugin;
		if (!inkPlugin.settings.booxConnectionEnabled) return;

		const windowWidth = window.innerWidth;
		const windowHeight = window.innerHeight;

		const embedRect = editorWrapperRefEl.current.getBoundingClientRect();
		const canvasX = Math.round(embedRect.x);
		const canvasY = Math.round(embedRect.y);
		const canvasWidth = Math.round(embedRect.width);
		const canvasHeight = Math.round(embedRect.height);

		// drawCanvasDebugOverlays({ rect: { x: canvasX, y: canvasY, width: canvasWidth, height: canvasHeight } });

		inkPlugin.booxConnection.sendUpdateDrawingArea({
			x: canvasX,
			y: canvasY,
			canvasWidth,
			canvasHeight,
			appWidth: windowWidth,
			appHeight: windowHeight,
		});
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
	function createStrokeFromBoox(canvasRelativeStrokePoints: CanvasRelativeStrokePoint[]) {
		if(!editorWrapperRefEl.current) return;
		if(!tlEditorRef.current) return;

		const tlBounds = tlEditorRef.current.getViewportPageBounds();
		const embedBounds = editorWrapperRefEl.current.getBoundingClientRect();

		// convert from embed coordinates to tldraw camera coordinates
		const xScaleCoeff = tlBounds.w / embedBounds.width;
		const yScaleCoeff = tlBounds.h / embedBounds.height;
		const tldrawStrokePoints = canvasRelativeStrokePoints.map( (canvasStrokePoint: CanvasRelativeStrokePoint) => ({
			x: tlBounds.x + canvasStrokePoint.x * xScaleCoeff,
			y: tlBounds.y + canvasStrokePoint.y * yScaleCoeff,
			z: canvasStrokePoint.pressure,
			// Also has size, and tiltX/Y, and timestamp
		}))

		// FOR DEBUGGING ONLY
		// drawCanvasDebugOverlays({ strokePoints: canvasRelativeStrokePoints });
		
		createTldrawStroke(tldrawStrokePoints);
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


