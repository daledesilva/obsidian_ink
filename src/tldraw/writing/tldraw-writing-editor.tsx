import './tldraw-writing-editor.scss';
import { Box, Editor, HistoryEntry, StoreSnapshot, TLStoreSnapshot, TLRecord, TLShapeId, TLStore, TLUiOverrides, TLUnknownShape, Tldraw, getSnapshot, TLSerializedStore, TldrawOptions, TldrawEditor, defaultTools, defaultShapeTools, defaultShapeUtils, defaultBindingUtils, TldrawScribble, TldrawShapeIndicators, TldrawSelectionForeground, TldrawSelectionBackground, TldrawHandles, TLEditorSnapshot, TLEventInfo } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, WritingCameraLimits, adaptTldrawToObsidianThemeMode, deleteObsoleteWritingTemplateShapes, focusChildTldrawEditor, getActivityType, getWritingContainerBounds, getWritingSvg, hideWritingContainer, hideWritingLines, hideWritingTemplate, initWritingCamera, initWritingCameraLimits, lockShape, prepareWritingSnapshot, preventTldrawCanvasesCausingObsidianGestures, resizeWritingTemplateInvitingly, restrictWritingCamera, silentlyChangeStore, unhideWritingContainer, unhideWritingLines, unhideWritingTemplate, unlockShape, updateWritingStoreIfNeeded, useStash } from "../../utils/tldraw-helpers";
import { WritingContainer, WritingContainerUtil } from "../writing-shapes/writing-container"
import { WritingMenu } from "../writing-menu/writing-menu";
import InkPlugin from "../../main";
import * as React from "react";
import { MENUBAR_HEIGHT_PX, WRITE_LONG_DELAY_MS, WRITE_SHORT_DELAY_MS, WRITING_LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';
import { InkFileData, buildWritingFileData } from 'src/utils/page-file';
import { Notice, TFile } from 'obsidian';
import { PrimaryMenuBar } from '../primary-menu-bar/primary-menu-bar';
import ExtendedWritingMenu from '../extended-writing-menu/extended-writing-menu';
import classNames from 'classnames';
import { WritingLines, WritingLinesUtil } from '../writing-shapes/writing-lines';
import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';
import {getAssetUrlsByImport} from '@tldraw/assets/imports';
import { editorActiveAtom, WritingEmbedState, embedStateAtom } from './writing-embed';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { getInkFileData } from 'src/utils/getInkFileData';
import { verbose } from 'src/utils/log-to-console';
import { SecondaryMenuBar } from '../secondary-menu-bar/secondary-menu-bar';
import ModifyMenu from '../modify-menu/modify-menu';

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
const myOverrides: TLUiOverrides = {}
const tlOptions: Partial<TldrawOptions> = {
	defaultSvgPadding: 0,
}

export function TldrawWritingEditor(props: TldrawWritingEditorProps) {

	const [tlEditorSnapshot, setTlEditorSnapshot] = React.useState<TLEditorSnapshot>()
	const setEmbedState = useSetAtom(embedStateAtom);
	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const tlEditorRef = useRef<Editor>();
	const tlEditorWrapperElRef = useRef<HTMLDivElement>(null);
	const fingerBlockerElRef = useRef<HTMLDivElement>(null);
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

	const handleMount = (_tlEditor: Editor) => {
		const tlEditor = tlEditorRef.current = _tlEditor;
		setEmbedState(WritingEmbedState.editor);
		focusChildTldrawEditor(tlEditorWrapperElRef.current);
		preventTldrawCanvasesCausingObsidianGestures(tlEditor);

		resizeContainerIfEmbed(tlEditorRef.current);
		if(tlEditorWrapperElRef.current) {
			// Makes the editor visible inly after it's fully mounted
			tlEditorWrapperElRef.current.style.opacity = '1';

			// Initialise common handlers for default tool selected
			setCommonToolUseListeners(tlEditorRef.current, tlEditorWrapperElRef.current);
		}

		updateWritingStoreIfNeeded(tlEditor);
		
		// tldraw content setup
		adaptTldrawToObsidianThemeMode(tlEditor);
		resizeWritingTemplateInvitingly(tlEditor);
		resizeContainerIfEmbed(tlEditor);	// Has an effect if the embed is new and started at 0

				
		// view set up
		if(props.embedded) {
			initWritingCamera(tlEditor);
			tlEditor.setCameraOptions({
				isLocked: true,
			})
		} else {
			initWritingCamera(tlEditor, MENUBAR_HEIGHT_PX);
			cameraLimitsRef.current = initWritingCameraLimits(tlEditor);
		}

		// Runs on any USER caused change to the store, (Anything wrapped in silently change method doesn't call this).
		const removeUserActionListener = tlEditor.store.listen((entry) => {
			if(!tlEditorWrapperElRef.current) return;

			const activity = getActivityType(entry);
			switch (activity) {
				case Activity.PointerMoved:
					// REVIEW: Consider whether things are being erased
					break;

				case Activity.CameraMovedAutomatically:
				case Activity.CameraMovedManually:
					if(cameraLimitsRef.current) restrictWritingCamera(tlEditor, cameraLimitsRef.current);
					unstashStaleContent(tlEditor);
					break;

				case Activity.DrawingStarted:
					resetInputPostProcessTimers();
					stashStaleContent(tlEditor);
					break;
					
				case Activity.DrawingContinued:
					resetInputPostProcessTimers();
					break;
							
				case Activity.DrawingCompleted:
					queueOrRunStorePostProcesses(tlEditor);
					break;
					
				case Activity.DrawingErased:
					queueOrRunStorePostProcesses(tlEditor);
					break;
					
				default:
					// Catch anything else not specifically mentioned (ie. draw shape, etc.)
					// queueOrRunStorePostProcesses(editor);
					// verbose('Activity not recognised.');
					// verbose(['entry', entry], {freeze: true});
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
					await completeSave(tlEditor);
					unmountActions();	// Clean up immediately so nothing else occurs between this completeSave and a future unmount
				},
				resize: () => {
					const camera = tlEditor.getCamera()
					const cameraY = camera.y;
					initWritingCamera(tlEditor);
					tlEditor.setCamera({x: camera.x, y: cameraY})
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
		// verbose('incrementalSave');
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
		// verbose('completeSave');
		let previewUri;
		
		unstashStaleContent(editor);
		const tlEditorSnapshot = getSnapshot(editor.store);
		const svgObj = await getWritingSvg(editor);
		stashStaleContent(editor);
		
		if (svgObj) {
			previewUri = svgObj.svg;//await svgToPngDataUri(svgObj)
			// if(previewUri) addDataURIImage(previewUri)	// NOTE: Option for testing
		}

		if(previewUri) {
			const pageData = buildWritingFileData({
				tlEditorSnapshot: tlEditorSnapshot,
				previewUri,
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
			ref = {tlEditorWrapperElRef}
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
					if(!tlEditorWrapperElRef.current) return;
					if(!fingerBlockerElRef.current) return;

					if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
						lockPageScrolling(tlEditorWrapperElRef.current);
						closeKeyboard();
					} else {
						// NOTE: This still doesn't let the first finger touch after pen use scroll. You have to touch twice.
						unlockPageScrolling(tlEditorWrapperElRef.current);
						closeKeyboard();
					}
				}}

				// This works for pens that detect hover.
				// But also causes issues with unfinished lines.
				// onPointerOut={(e) => {
				// 	if(!tlEditorWrapperElRef.current) return;
				// 	if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				// 		unlockPageScrolling(tlEditorWrapperElRef.current);
				// 		closeKeyboard();
				// 	}
				// }}
				
				// NOTE: This allows initial pointer down events to be stopped and only sent to tldraw if they're related to drawing
				onPointerDown={(e) => {
					if(!tlEditorWrapperElRef.current) return;
					if(!fingerBlockerElRef.current) return;

					if (e.pointerType === 'pen' || e.pointerType === 'mouse') {

						const tlCanvas = tlEditorWrapperElRef.current?.querySelector('.tl-canvas');
						if (tlCanvas) {
							const newEvent = new PointerEvent('pointerdown', {
								pointerId: e.pointerId,
								pointerType: e.pointerType,
								clientX: e.clientX,
								clientY: e.clientY,
								bubbles: true
							});
							tlCanvas.dispatchEvent(newEvent);
						}

					} else {
						// Ignore touch events as they just control scrolling atm.
					}
				}}


				// onPointerMove={(e) => {
				// 	if(!tlEditorWrapperElRef.current) return;
				// 	if(!fingerBlockerElRef.current) return;

				// 	if (e.pointerType === 'pen' || e.pointerType === 'mouse') {


				// 	} else {
				// 		// Ignore it if it was dispatched manually (So it doesn't create an infinite loop)
				// 		// if(!e.isTrusted) return;
				// 		new Notice('Pointer Move');
						
				// 		const cmScroller = tlEditorWrapperElRef.current.closest('.cm-scroller');
				// 		if (cmScroller) {
				// 			cmScroller.scrollTo({
				// 				top: cmScroller.scrollTop + e.movementY,
				// 				left: cmScroller.scrollLeft + e.movementX,
				// 			})
				// 		}
				// 	}
				// }}

			/>
			<PrimaryMenuBar>
				<WritingMenu
					getTlEditor = {getTlEditor}
					onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
					onToolChange = {() => {
						if(!tlEditorRef.current) return;
						if(!tlEditorWrapperElRef.current) return;
						setCommonToolUseListeners(tlEditorRef.current, tlEditorWrapperElRef.current);
					}}
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
        const inkFileData = await getInkFileData(props.plugin, props.writingFile)
        if(inkFileData.tldraw) {
            const snapshot = prepareWritingSnapshot(inkFileData.tldraw as TLEditorSnapshot);
            setTlEditorSnapshot(snapshot);
        }
    }


};

function setCommonToolUseListeners(tlEditor: Editor, tlEditorWrapperEl: HTMLDivElement) {
	const curTool = tlEditor.getCurrentTool();
	if(curTool) {
		curTool.onPointerDown = (e: TLEventInfo) => {
			// new Notice('Tldraw Pen Down');
			// activePointerCount++; // Increment counter
			// closeKeyboard();
			
			curTool.onPointerMove = (e: TLEventInfo) =>  {
				
				// Nothing yet
			}
			curTool.onPointerUp = (e: TLEventInfo) => {
				// new Notice('Pointer Up');
				// activePointerCount = Math.max(0, activePointerCount - 1); // Decrement counter, never go below 0
				// debouncedUnlockPageScrolling(tlEditorWrapperEl);
				curTool.onPointerMove = undefined;
			}

		}
	}
};

function lockPageScrolling(tlEditorWrapper: HTMLDivElement) {
	clearPageScrollingTimeouts();
	const cmScroller = tlEditorWrapper.closest('.cm-scroller');
	if (cmScroller) {
		// new Notice('Lock Page Scrolling');
		// if (scrollingLocked) return;
		// prevent scrolling so that the page doesn't move while using tools
		(cmScroller as HTMLElement).style.overflow = 'hidden';
		// also hide the scrollbar so that the scrolling can be turned back on quickly without appearing to flicker between consecutive strokes.
		(cmScroller as HTMLElement).style.scrollbarColor = 'transparent transparent';
		// scrollingLocked = true;
	}
}

let unlockPageScrollingTimeout: NodeJS.Timeout | undefined;
let unhidePageScrollerTimeout: NodeJS.Timeout | undefined;
let activePointerCount = 0; // Track number of active pointer interactions
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
	// const cmScroller = tlEditorWrapper.closest('.cm-scroller');
	unlockPageScrollingTimeout = setTimeout(() => {
		// if (cmScroller) {
		// new Notice('Unlock Page Scrolling');
			// Only unlock if there are no active pointers
			// if (activePointerCount === 0) {
			// if (scrollingLocked) {
				// (cmScroller as HTMLElement).style.overflow = 'auto';
				// scrollingLocked = false;
			// } 
			// else {
			// 	new Notice('unlock Race condition prevented');
			// }
		// }
		unlockPageScrolling(tlEditorWrapper);
	}, 100);

	// The visibility of the scrollbar waits longer so that it doesn't appear to flicker between writing strokes.
	unhidePageScrollerTimeout = setTimeout(() => {
		// Only unhide if there are no active pointers
		const cmScroller = tlEditorWrapper.closest('.cm-scroller');
		if (cmScroller) {
			// if (activePointerCount === 0) {
			// 	(cmScroller as HTMLElement).style.scrollbarColor = 'auto';
			// }
			// } else {
			// 	new Notice('unHIDE Race condition prevented');
			// }
		}
	}, 1000);
}

function unlockPageScrolling(tlEditorWrapper: HTMLDivElement) {
	const cmScroller = tlEditorWrapper.closest('.cm-scroller');
	if (cmScroller) {
		(cmScroller as HTMLElement).style.overflow = 'auto';
	}
}

function closeKeyboard() {
	// Blurring focus closes the keyboard, whereas focusing the tlEditorWrapper didn't.
	// It partly helps with iOS scribble support by prevent scribbling taking over, but it seems to block a lot of input.
	// Tried focusing the tlEditor container but it didn't solve the scribble issue and also caused the scrolling to jump to fit that element on screen.
	if (document.activeElement instanceof HTMLElement) {
		if(!document.activeElement.hasClass('tl-canvas')) {
			document.activeElement.blur();
		}
	}
}
