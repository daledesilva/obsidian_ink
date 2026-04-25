import './tldraw-writing-editor.scss';
import { Box, Editor, getSnapshot, TldrawOptions, TldrawEditor, defaultTools, defaultShapeTools, defaultShapeUtils, TldrawScribble, TldrawShapeIndicators, TldrawSelectionForeground, TldrawSelectionBackground, TldrawHandles, TLEditorSnapshot, TLEventInfo } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, WritingCameraLimits, adaptTldrawToObsidianThemeMode, extendWritingTemplateToFillViewport, focusChildTldrawEditor, getActivityType, getLineHeightFromEditor, getTightWritingBounds, getWritingSvg, initWritingCamera, initWritingCameraLimits, prepareWritingSnapshot, preventTldrawCanvasesCausingObsidianGestures, resizeWritingTemplateInvitingly, resizeWritingTemplateInvitinglyIfNecessary, restrictWritingCamera, updateWritingStoreIfNeeded, useStash } from "src/components/formats/current/utils/tldraw-helpers";
import { WritingContainerUtil } from "../shapes/writing-container"
import { WritingMenu } from "src/components/jsx-components/writing-menu/writing-menu";
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
import { verbose } from 'src/logic/utils/log-to-console';
import { logToVault } from 'src/logic/utils/log-to-vault';
import { SecondaryMenuBar } from 'src/tldraw/secondary-menu-bar/secondary-menu-bar';
import ModifyMenu from 'src/tldraw/modify-menu/modify-menu';
import { syncUnifiedUndoHistory, initialize } from 'src/logic/undo-redo/unified-undo-stack';
import { getRegisteredEmbedCountForLeaf, register as registerInkEditor, unregister as unregisterInkEditor } from 'src/logic/undo-redo/ink-editor-registry';
import { registerDedicatedInkEditor, unregisterDedicatedInkEditor } from 'src/logic/undo-redo/dedicated-ink-editor-registry';
import { getObsidianUndoDepthForLeaf } from 'src/logic/undo-redo/obsidian-undo-depth';
import { getTldrawNumUndos } from 'src/logic/undo-redo/tldraw-undo-depth';

///////
///////

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

export function TldrawWritingEditor(props: TldrawWritingEditorProps) {

	const [tlEditorSnapshot, setTlEditorSnapshot] = React.useState<TLEditorSnapshot>()
	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const tlEditorRef = useRef<Editor>();
	const editorWrapperRefEl = useRef<HTMLDivElement>(null);
	const curHeightRef = useRef<number | null>(null);
	const { stashStaleContent, unstashStaleContent } = useStash(props.plugin);
	const cameraLimitsRef = useRef<WritingCameraLimits>();
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

	if(!tlEditorSnapshot) return <></>
	verbose('EDITOR snapshot loaded')

	////////

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
		editor.updateInstanceState({ isGridMode: false });
		focusChildTldrawEditor(editorWrapperRefEl.current);
		preventTldrawCanvasesCausingObsidianGestures(editor);

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
		logToVault('Writing handleMount: curHeightRef=' + curHeightRef.current);
		const mountHeight = resizeWritingTemplateInvitingly(editor);
		logToVault('Writing handleMount: mountHeight=' + mountHeight);
		if (mountHeight !== null) {
			curHeightRef.current = mountHeight;
			resizeContainerIfEmbed(editor, mountHeight);	// Has an effect if the embed is new and started at 0
		}
				
		// view set up
		let removeWheelListener: (() => void) | undefined;
		if(props.embedded) {
			initWritingCamera(editor);
			editor.setCameraOptions({
				isLocked: true,
			})
		} else {
			initWritingCamera(editor, MENUBAR_HEIGHT_PX);
			cameraLimitsRef.current = initWritingCameraLimits(editor);

			// Extend lines to fill the visible writing area on first open
			const viewportFillHeight = extendWritingTemplateToFillViewport(editor, MENUBAR_HEIGHT_PX);
			if (viewportFillHeight !== null) curHeightRef.current = viewportFillHeight;

			// Handle wheel: vertical scroll only — intercept before Obsidian sees it
			const wrapperEl = editorWrapperRefEl.current;
			if (wrapperEl) {
				const onWheelScroll = (e: WheelEvent) => {
					e.preventDefault();
					e.stopPropagation();
					let deltaY = e.deltaY;
					if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) deltaY *= 16;
					if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) deltaY *= 600;
					const camera = editor.getCamera();
					editor.setCamera({ x: camera.x, y: camera.y - deltaY, z: camera.z });
				};
				wrapperEl.addEventListener('wheel', onWheelScroll, { capture: true, passive: false });
				removeWheelListener = () => wrapperEl.removeEventListener('wheel', onWheelScroll, { capture: true });
			}
		}

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
					queueOrRunStorePostProcesses(editor);
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
			removeWheelListener?.();
			if (props.embedded && props.embedId) {
				unregisterInkEditor(props.embedId);
			}
			if (!props.embedded && leafId) {
				unregisterDedicatedInkEditor(leafId, editor);
			}
		}

		if(props.saveControlsReference) {
			props.saveControlsReference({
				// save: () => completeSave(editor),
				saveAndHalt: async (): Promise<void> => {
					await completeSave(editor);
					unmountActions();	// Clean up immediately so nothing else occurs between this completeSave and a future unmount
				},
				clearAll: async (): Promise<void> => {
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
				}
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
		props.onResize(invitingBounds, tightBounds);
	}

	const queueOrRunStorePostProcesses = (editor: Editor) => {
		instantInputPostProcess(editor);
		smallDelayInputPostProcess(editor);
		longDelayInputPostProcess(editor);
	}

	// Use this to run optimisations that that are quick and need to occur immediately on lifting the stylus
	const instantInputPostProcess = (editor: Editor) => { //, entry?: HistoryEntry<TLRecord>) => {
		logToVault('Writing instantInputPostProcess: curHeightRef=' + curHeightRef.current);
		const prevHeight = curHeightRef.current;
		const newHeight = resizeWritingTemplateInvitinglyIfNecessary(editor, curHeightRef.current);
		logToVault('Writing instantInputPostProcess: newHeight=' + newHeight);
		if (newHeight !== null) curHeightRef.current = newHeight;
		if (newHeight !== null && newHeight !== prevHeight) resizeContainerIfEmbed(editor, newHeight);
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
	const resetLongPostProcessTimer = () => {
		clearTimeout(longDelayPostProcessTimeoutRef.current);
	}
	const resetInputPostProcessTimers = () => {
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
				shapeUtils = {[...defaultShapeUtils, ...MyCustomShapes]}
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
			<FingerBlocker getTlEditor={getTlEditor} wrapperRef={editorWrapperRefEl} />

			<PrimaryMenuBar>
				<WritingMenu
					getTlEditor = {getTlEditor}
					onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
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
			</SecondaryMenuBar>
			
		</div>
	</>;

	// Helper functions
	///////////////////

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

// (helpers removed; handled by FingerBlocker)

// (Reverted overlay helpers per v1-only change policy)



