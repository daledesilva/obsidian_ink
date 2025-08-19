import './tldraw-drawing-editor.scss';
import { Editor, TLUiOverrides, TldrawEditor, TldrawHandles, TldrawOptions, TldrawScribble, TldrawSelectionBackground, TldrawSelectionForeground, TldrawShapeIndicators, defaultShapeTools, defaultShapeUtils, defaultTools, getSnapshot, TLEditorSnapshot, TLEventInfo } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, adaptTldrawToObsidianThemeMode, focusChildTldrawEditor, getActivityType, getDrawingSvg, initDrawingCamera, prepareDrawingSnapshot, preventTldrawCanvasesCausingObsidianGestures } from "src/logic/utils/tldraw-helpers";
import * as React from "react";
import { TFile } from 'obsidian';
import { InkFileData } from 'src/components/formats/current/types/file-data';
import { buildDrawingFileData } from 'src/components/formats/current/utils/build-file-data';
import { DRAW_SHORT_DELAY_MS, DRAW_LONG_DELAY_MS } from 'src/constants';
import { PrimaryMenuBar } from 'src/components/jsx-components/primary-menu-bar/primary-menu-bar';
import DrawingMenu from 'src/components/jsx-components/drawing-menu/drawing-menu';
import ExtendedDrawingMenu from 'src/components/jsx-components/extended-drawing-menu/extended-drawing-menu';
import classNames from 'classnames';
import { useAtomValue, useSetAtom } from 'jotai';
import { getInkFileData } from 'src/logic/utils/getInkFileData';
import { ResizeHandle } from 'src/components/jsx-components/resize-handle/resize-handle';
import { verbose } from 'src/logic/utils/log-to-console';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { DrawingEmbedState, editorActiveAtom_v2, embedStateAtom_v2 } from '../drawing-embed/drawing-embed';

///////
///////

interface TldrawDrawingEditor_Props {
    onReady?: Function,
	drawingFile: TFile,
	save: (pageData: InkFileData) => void,
	extendedMenu?: any[]

	// For embeds
	embedded?: boolean,
	resizeEmbed?: (pxWidthDiff: number, pxHeightDiff: number) => void,
	closeEditor?: Function,
	saveControlsReference?: Function,
}

// Wraps the component so that it can full unmount when inactive
export const TldrawDrawingEditorWrapper: React.FC<TldrawDrawingEditor_Props> = (props) => {
    const editorActive = useAtomValue(editorActiveAtom_v2);

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
    const setEmbedState = useSetAtom(embedStateAtom_v2);
	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const tlEditorRef = useRef<Editor>();
	const editorWrapperRefEl = useRef<HTMLDivElement>(null);
	const fingerBlockerElRef = useRef<HTMLDivElement>(null);
	const recentPenInput = useRef<boolean>(false);
	
	// On mount
	React.useEffect( ()=> {
		verbose('EDITOR mounted');
		fetchFileData();
		return () => {
			verbose('EDITOR unmounting');
		}
	}, [])

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
        setEmbedState(DrawingEmbedState.editor);
		focusChildTldrawEditor(editorWrapperRefEl.current);
		preventTldrawCanvasesCausingObsidianGestures(editor);

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


		// Make visible once prepared
		if(editorWrapperRefEl.current) {
			editorWrapperRefEl.current.style.opacity = '1';

			// Initialise common handlers for default tool selected
			setCommonToolUseListeners(tlEditorRef.current, editorWrapperRefEl.current);
		}

		// Runs on any USER caused change to the store, (Anything wrapped in silently change method doesn't call this).
		const removeUserActionListener = editor.store.listen((entry) => {

			const activity = getActivityType(entry);
			switch (activity) {
				case Activity.PointerMoved:
					// REVIEW: Consider whether things are being erased
					break;

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
					queueOrRunStorePostProcesses(editor);
					embedPostProcess(editor);
					break;

				case Activity.DrawingErased:
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
		}

		if(props.saveControlsReference) {
			props.saveControlsReference({
				save: () => completeSave(editor),
				saveAndHalt: async (): Promise<void> => {
					await completeSave(editor)
					unmountActions();	// Clean up immediately so nothing else occurs between this completeSave and a future unmount
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
			}
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
		const tlEditorSnapshot = getSnapshot(editor.store);
		const pageData = buildDrawingFileData({
			tlEditorSnapshot: tlEditorSnapshot,
			previewIsOutdated: true,
		})
		props.save(pageData);
	}

	const completeSave = async (editor: Editor): Promise<void> => {
		verbose('completeSave');
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

				// Prevent autoFocussing so it can be handled in the handleMount
				autoFocus = {false}
			/>
			<div
				ref = {fingerBlockerElRef}
				style={{
					position: 'absolute',
					inset: 0,
					// backgroundColor: 'rgba(255,0,0,0.3)',
					zIndex: 1000,

					// Prevent text selections around the canvas on touch devices
					userSelect: 'none',
					WebkitUserSelect: 'none',
					MozUserSelect: 'none',
					msUserSelect: 'none'
				}}

				onPointerEnter={(e) => {
					if(!editorWrapperRefEl.current) return;
					if(!fingerBlockerElRef.current) return;

					if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
						lockPageScrolling(editorWrapperRefEl.current);
						closeKeyboard();
					} else {
						unlockPageScrolling(editorWrapperRefEl.current);
						closeKeyboard();
					}
				}}

				onPointerDown={(e) => {
					if(!editorWrapperRefEl.current) return;
					if(!fingerBlockerElRef.current) return;

					if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
						const tlCanvas = editorWrapperRefEl.current?.querySelector('.tl-canvas');
						if (tlCanvas) {
							const newEvent = new PointerEvent('pointerdown', {
								pointerId: e.pointerId,
								pointerType: e.pointerType,
								clientX: e.clientX,
								clientY: e.clientY,
								bubbles: true
							});
							tlCanvas.dispatchEvent(newEvent);
							recentPenInput.current = true;
						}
					} else {
						// Ignore touch initial down; used for scrolling
					}
				}}

				onPointerMove={(e) => {
					if(e.pointerType !== 'touch') return; // Let tldraw handle pen/mouse
					if(!editorWrapperRefEl.current) return;
					if(!fingerBlockerElRef.current) return;
					if(!recentPenInput.current) return; // Only fake scrolling for the first touch event after a pen event

					const cmScroller = editorWrapperRefEl.current.closest('.cm-scroller');
					if (cmScroller) {
						cmScroller.scrollTo({
							top: cmScroller.scrollTop - e.movementY,
							left: cmScroller.scrollLeft - e.movementX,
						})
					}
				}}

				onPointerUp={(e) => {
					if (e.pointerType === 'touch') {
						recentPenInput.current = false;
					}
				}}

				onPointerLeave={(e) => {
					if(pointerDown) return; // Do not unlock during active drawing
					if(!editorWrapperRefEl.current) return;
					recentPenInput.current = false;
					unlockPageScrolling(editorWrapperRefEl.current);
				}}

				onWheel={(e) => {
					if(!editorWrapperRefEl.current) return;
					const cmScroller = editorWrapperRefEl.current.closest('.cm-scroller');
					if (cmScroller) {
						cmScroller.scrollTo({
							top: cmScroller.scrollTop + e.deltaY,
							left: cmScroller.scrollLeft + e.deltaX
						});
					}
				}}

			/>
			
			<PrimaryMenuBar>
				<DrawingMenu
					getTlEditor = {getTlEditor}
					onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
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
				{!props.embedded && props.extendedMenu && (	// TODO: I think this can be removed as it will never show?
					<ExtendedDrawingMenu
						menuOptions = {customExtendedMenu}
					/>
				)}
			</PrimaryMenuBar>
		</div>

		{props.resizeEmbed && (
			<ResizeHandle
				resizeEmbed = {resizeEmbed}
			/>
		)}
	</>;

	// Helpers
	///////////////

	function resizeEmbed(pxWidthDiff: number, pxHeightDiff: number) {
		if(!props.resizeEmbed) return;
		props.resizeEmbed(pxWidthDiff, pxHeightDiff);
	}

};

// This should probably be encapsulated
let pointerDown = false;

function setCommonToolUseListeners(tlEditor: Editor | undefined, tlEditorWrapperEl: HTMLDivElement) {
	if(!tlEditor) return;
	const curTool = tlEditor.getCurrentTool();
	if(curTool) {
		curTool.onPointerDown = (e: TLEventInfo) => {
			pointerDown = true;
			curTool.onPointerMove = (e: TLEventInfo) =>  {
				// Nothing yet
			}
			curTool.onPointerUp = (e: TLEventInfo) => {
				curTool.onPointerMove = undefined;
				pointerDown = false;
			}

		}
	}
}

function lockPageScrolling(tlEditorWrapper: HTMLDivElement) {
	clearPageScrollingTimeouts();
	const cmScroller = tlEditorWrapper.closest('.cm-scroller');
	if (cmScroller) {
		(cmScroller as HTMLElement).style.overflow = 'hidden';
		(cmScroller as HTMLElement).style.scrollbarColor = 'transparent transparent';
		scrollingLocked = true;
	}
}

let unlockPageScrollingTimeout: NodeJS.Timeout | undefined;
let unhidePageScrollerTimeout: NodeJS.Timeout | undefined;
let scrollingLocked = false;

function clearPageScrollingTimeouts() {
	clearTimeout(unlockPageScrollingTimeout);
	clearTimeout(unhidePageScrollerTimeout);
	unlockPageScrollingTimeout = undefined;
	unhidePageScrollerTimeout = undefined;
}

function debouncedUnlockPageScrolling(tlEditorWrapper: HTMLDivElement) {
	clearPageScrollingTimeouts();
	
	// NOTE: This timeout is necessary because otherwise a scroller that has just turned back on or off can interfere with the tldraw canvas reporting the next completed drawing (very occasionally).
	unlockPageScrollingTimeout = setTimeout(() => {
		unlockPageScrolling(tlEditorWrapper);
	}, 100);
}

function unlockPageScrolling(tlEditorWrapper: HTMLDivElement) {
	const cmScroller = tlEditorWrapper.closest('.cm-scroller');
	if (cmScroller) {
		(cmScroller as HTMLElement).style.overflow = 'auto';
		scrollingLocked = false;
	}

	// The visibility of the scrollbar waits longer so that it doesn't appear to flicker between writing strokes.
	unhidePageScrollerTimeout = setTimeout(() => {
		unhidePageScroller(tlEditorWrapper);
	}, 200);
}

function unhidePageScroller(tlEditorWrapper: HTMLDivElement) {
	const cmScroller = tlEditorWrapper.closest('.cm-scroller');
	if (cmScroller) {
		(cmScroller as HTMLElement).style.scrollbarColor = 'auto';
	}
}

function closeKeyboard() {
	// Blurring focus closes the keyboard
	if (document.activeElement instanceof HTMLElement) {
		if(!document.activeElement.hasClass('tl-canvas')) {
			document.activeElement.blur();
		}
	}
}


