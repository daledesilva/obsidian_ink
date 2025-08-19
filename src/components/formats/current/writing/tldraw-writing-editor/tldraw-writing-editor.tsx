import './tldraw-writing-editor.scss';
import { Editor, getSnapshot, TldrawOptions, TldrawEditor, defaultTools, defaultShapeTools, defaultShapeUtils, TldrawScribble, TldrawShapeIndicators, TldrawSelectionForeground, TldrawSelectionBackground, TldrawHandles, TLEditorSnapshot, TLEventInfo } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, WritingCameraLimits, adaptTldrawToObsidianThemeMode, focusChildTldrawEditor, getActivityType, getWritingContainerBounds, getWritingSvg, initWritingCamera, initWritingCameraLimits, prepareWritingSnapshot, preventTldrawCanvasesCausingObsidianGestures, resizeWritingTemplateInvitingly, restrictWritingCamera, updateWritingStoreIfNeeded, useStash } from "src/logic/utils/tldraw-helpers";
import { WritingContainerUtil } from "../shapes/writing-container"
import { WritingMenu } from "src/components/jsx-components/writing-menu/writing-menu";
import InkPlugin from "src/main";
import * as React from "react";
import { MENUBAR_HEIGHT_PX, WRITE_LONG_DELAY_MS, WRITE_SHORT_DELAY_MS } from 'src/constants';
import { InkFileData } from 'src/components/formats/current/types/file-data';
import { buildWritingFileData } from 'src/components/formats/current/utils/build-file-data';
import { TFile } from 'obsidian';
import { PrimaryMenuBar } from 'src/components/jsx-components/primary-menu-bar/primary-menu-bar';
import ExtendedWritingMenu from 'src/components/jsx-components/extended-writing-menu/extended-writing-menu';
import classNames from 'classnames';
import { WritingLinesUtil } from '../shapes/writing-lines';
import { editorActiveAtom, WritingEmbedState, embedStateAtom } from '../writing-embed/writing-embed';
import { useAtomValue, useSetAtom } from 'jotai';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { verbose } from 'src/logic/utils/log-to-console';

///////
///////

interface TldrawWritingEditorProps {
	onResize?: Function,
	plugin: InkPlugin,
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
    const editorActive = useAtomValue(editorActiveAtom);

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
	const setEmbedState = useSetAtom(embedStateAtom);
	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const tlEditorRef = useRef<Editor>();
	const editorWrapperRefEl = useRef<HTMLDivElement>(null);
	const fingerBlockerElRef = useRef<HTMLDivElement>(null);
	const recentPenInput = useRef<boolean>(false);
	const { stashStaleContent, unstashStaleContent } = useStash(props.plugin);
	const cameraLimitsRef = useRef<WritingCameraLimits>();
	const [preventTransitions, setPreventTransitions] = React.useState<boolean>(true);

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
		setEmbedState(WritingEmbedState.editor);
		focusChildTldrawEditor(editorWrapperRefEl.current);
		preventTldrawCanvasesCausingObsidianGestures(editor);

		resizeContainerIfEmbed(tlEditorRef.current);
		if(editorWrapperRefEl.current) {
			editorWrapperRefEl.current.style.opacity = '1';

			// Initialise common handlers for default tool selected
			setCommonToolUseListeners(tlEditorRef.current, editorWrapperRefEl.current);
		}

		updateWritingStoreIfNeeded(editor);
		
		// tldraw content setup
		adaptTldrawToObsidianThemeMode(editor);
		resizeWritingTemplateInvitingly(editor);
		resizeContainerIfEmbed(editor);	// Has an effect if the embed is new and started at 0
				
		// view set up
		if(props.embedded) {
			initWritingCamera(editor);
			editor.setCameraOptions({
				isLocked: true,
			})
		} else {
			initWritingCamera(editor, MENUBAR_HEIGHT_PX);
			cameraLimitsRef.current = initWritingCameraLimits(editor);
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
					if(cameraLimitsRef.current) restrictWritingCamera(editor, cameraLimitsRef.current);
					unstashStaleContent(editor);
					break;

				case Activity.DrawingStarted:
					resetInputPostProcessTimers();
					stashStaleContent(editor);
					break;
					
				case Activity.DrawingContinued:
					resetInputPostProcessTimers();
					break;
							
				case Activity.DrawingCompleted:
					queueOrRunStorePostProcesses(editor);
					break;
					
				case Activity.DrawingErased:
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
		}

		if(props.saveControlsReference) {
			props.saveControlsReference({
				// save: () => completeSave(editor),
				saveAndHalt: async (): Promise<void> => {
					await completeSave(editor);
					unmountActions();	// Clean up immediately so nothing else occurs between this completeSave and a future unmount
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

	function resizeContainerIfEmbed (editor: Editor) {
		if (!props.embedded || !props.onResize) return;

		const embedBounds = editor.getViewportScreenBounds();
		const contentBounds = getWritingContainerBounds(editor);
		
		if (contentBounds) {
			const contentRatio = contentBounds.w / contentBounds.h;
			const newEmbedHeight = embedBounds.w / contentRatio;
			props.onResize(newEmbedHeight);
		}

	}

	const queueOrRunStorePostProcesses = (editor: Editor) => {
		instantInputPostProcess(editor);
		smallDelayInputPostProcess(editor);
		longDelayInputPostProcess(editor);
	}

	// Use this to run optimisations that that are quick and need to occur immediately on lifting the stylus
	const instantInputPostProcess = (editor: Editor) => { //, entry?: HistoryEntry<TLRecord>) => {
		resizeWritingTemplateInvitingly(editor);
		resizeContainerIfEmbed(editor);
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
		unstashStaleContent(editor);
		const tlEditorSnapshot = getSnapshot(editor.store);
		stashStaleContent(editor);

        const pageData = buildWritingFileData({
			tlEditorSnapshot: tlEditorSnapshot,
			previewIsOutdated: true,
		})
		props.save(pageData);
	}

	const completeSave = async (editor: Editor): Promise<void> => {
		verbose('completeSave');
        let svgString;
		
		unstashStaleContent(editor);
		const tlEditorSnapshot = getSnapshot(editor.store);
		const svgObj = await getWritingSvg(editor);
		stashStaleContent(editor);
		
        if (svgObj) {
            svgString = svgObj.svg;
			// if(previewUri) addDataURIImage(previewUri)	// NOTE: Option for testing
		}

        if(svgString) {
            const pageData = buildWritingFileData({
                tlEditorSnapshot: tlEditorSnapshot,
                svgString,
            })
			props.save(pageData);
			// await savePngExport(props.plugin, previewUri, props.fileRef) // REVIEW: Still need a png?

		} else {
            const pageData = buildWritingFileData({
				tlEditorSnapshot: tlEditorSnapshot,
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

					// These ensure that the writing can't erroneously cause text selections around the whole canvas element (which happens on iPad)
					userSelect: 'none',
					WebkitUserSelect: 'none',
					MozUserSelect: 'none',
					msUserSelect: 'none'
				}}

				// Locking here makes the first pen stroke more reliable.
				onPointerEnter={(e) => {
					if(!editorWrapperRefEl.current) return;
					if(!fingerBlockerElRef.current) return;

					if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
						lockPageScrolling(editorWrapperRefEl.current);
						closeKeyboard();
					} else {
						// NOTE: This still doesn't let the first finger touch after pen use scroll. You have to touch twice.
						unlockPageScrolling(editorWrapperRefEl.current);
						closeKeyboard();
					}
				}}

				// NOTE: This allows initial pointer down events to be stopped and only sent to tldraw if they're related to drawing
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
						// Ignore touch events as they just control scrolling atm.
					}
				}}

				onPointerMove={(e) => {
					if(e.pointerType !== 'touch') return; // Let tldraw handle all pen input
					if(!editorWrapperRefEl.current) return;
					if(!fingerBlockerElRef.current) return;
					
					if(!recentPenInput.current) return; // Only fake scrolling for the first touch event after a pen event

					// HACK: This fakes the scroll for the first touch event after a pen event.
					// TODO: This doesn't yet allow for flicking.
					const cmScroller = editorWrapperRefEl.current.closest('.cm-scroller');
					if (cmScroller) {
						cmScroller.scrollTo({
							top: cmScroller.scrollTop - e.movementY,
							left: cmScroller.scrollLeft - e.movementX, // TODO: Haven't actually tested X
						})
					}
				}}

				onPointerUp={(e) => {
					if (e.pointerType === 'touch') {
						recentPenInput.current = false;
					}
				}}

				onPointerLeave={(e) => {
					if(pointerDown) return; // don't unlock the user's drawing (This as it leaves the div to focus the canvas)
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
				<WritingMenu
					getTlEditor = {getTlEditor}
					onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
				/>
				{props.embedded && props.extendedMenu && (
					<ExtendedWritingMenu
						onLockClick = { async () => {
							// REVIEW: Save immediately? incase it hasn't been saved yet
							if(props.closeEditor) props.closeEditor();
						}}
						menuOptions = {props.extendedMenu}
					/>
				)}
			</PrimaryMenuBar>

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
                setTlEditorSnapshot(snapshot);
            }
        }
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
			curTool.onPointerMove = (e: TLEventInfo) =>  {}
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
	if (document.activeElement instanceof HTMLElement) {
		if(!document.activeElement.hasClass('tl-canvas')) {
			document.activeElement.blur();
		}
	}
}

// (Reverted overlay helpers per v1-only change policy)



