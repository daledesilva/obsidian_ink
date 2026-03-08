import './tldraw-writing-editor.scss';
import { Box, Editor, getSnapshot, TldrawOptions, TldrawEditor, defaultTools, defaultShapeTools, defaultShapeUtils, TldrawScribble, TldrawShapeIndicators, TldrawSelectionForeground, TldrawSelectionBackground, TldrawHandles, TLEditorSnapshot, TLEventInfo } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, WritingCameraLimits, adaptTldrawToObsidianThemeMode, focusChildTldrawEditor, getActivityType, getTightWritingBounds, getWritingSvg, initWritingCamera, initWritingCameraLimits, prepareWritingSnapshot, preventTldrawCanvasesCausingObsidianGestures, resizeWritingTemplateInvitingly, resizeWritingTemplateInvitinglyIfNecessary, restrictWritingCamera, updateWritingStoreIfNeeded, useStash } from "src/components/formats/current/utils/tldraw-helpers";
import { WritingContainerUtil } from "../shapes/writing-container"
import { WritingMenu } from "src/components/jsx-components/writing-menu/writing-menu";
import InkPlugin from "src/main";
import * as React from "react";
import { MENUBAR_HEIGHT_PX, WRITE_LONG_DELAY_MS, WRITE_SHORT_DELAY_MS, WRITING_PAGE_WIDTH } from 'src/constants';
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
import { FingerBlocker } from 'src/components/jsx-components/finger-blocker/finger-blocker';
import { syncUnifiedUndoHistory, initialize } from 'src/logic/undo-redo/unified-undo-stack';
import { register as registerInkEditor, unregister as unregisterInkEditor } from 'src/logic/undo-redo/ink-editor-registry';
import { getObsidianUndoDepth } from 'src/logic/undo-redo/obsidian-undo-depth';
import { getTldrawNumUndos } from 'src/logic/undo-redo/tldraw-undo-depth';

///////
///////

interface TldrawWritingEditorProps {
	onResize?: (invitingBounds: Box, tightBounds: Box) => void,
	plugin: InkPlugin,
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
	const curHeightRef = useRef<number | null>(null);
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

		if(editorWrapperRefEl.current) {
			editorWrapperRefEl.current.style.opacity = '1';
		}

		updateWritingStoreIfNeeded(editor);
		
		// tldraw content setup
		adaptTldrawToObsidianThemeMode(editor);
		console.log('[ink] handleMount: curHeightRef.current before resize:', curHeightRef.current);
		const mountHeight = resizeWritingTemplateInvitingly(editor);
		console.log('[ink] handleMount: resizeWritingTemplateInvitingly returned:', mountHeight);
		if (mountHeight !== null) {
			curHeightRef.current = mountHeight;
			resizeContainerIfEmbed(editor, mountHeight);	// Has an effect if the embed is new and started at 0
		}
				
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

		// Unified undo stack: when embedded, sync Obsidian and tldraw history on each user change
		if (props.embedded && props.embedId && editorWrapperRefEl.current) {
			initialize(getObsidianUndoDepth(props.plugin), getTldrawNumUndos(editor));
			registerInkEditor(props.embedId, editor, editorWrapperRefEl.current);
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
					if (props.embedded && props.embedId) {
						syncUnifiedUndoHistory(props.embedId, { maxTldrawDelta: 1 });
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
					if (props.embedded && props.embedId) {
						syncUnifiedUndoHistory(props.embedId, { maxTldrawDelta: 1 });
					}
					queueOrRunStorePostProcesses(editor);
					break;
					
				case Activity.DrawingErased:
					if (props.embedded && props.embedId) {
						syncUnifiedUndoHistory(props.embedId, { maxTldrawDelta: 1 });
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
			if (props.embedded && props.embedId) {
				unregisterInkEditor(props.embedId);
			}
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
		console.log('[ink] instantInputPostProcess: curHeightRef.current before resize:', curHeightRef.current);
		const prevHeight = curHeightRef.current;
		const newHeight = resizeWritingTemplateInvitinglyIfNecessary(editor, curHeightRef.current);
		console.log('[ink] instantInputPostProcess: resizeWritingTemplateInvitinglyIfNecessary returned:', newHeight);
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
		unstashStaleContent(editor);
		const tlEditorSnapshot = getSnapshot(editor.store);
		const svgObj = await getWritingSvg(editor, curHeightRef.current);
		stashStaleContent(editor);

        const writingFileData = buildWritingFileData({
			tlEditorSnapshot: tlEditorSnapshot,
			svgString: svgObj?.svg,
		})
		props.save(writingFileData);
	}

	const completeSave = async (editor: Editor): Promise<void> => {
		verbose('completeSave');
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
			<FingerBlocker getTlEditor={getTlEditor} wrapperRef={editorWrapperRefEl} />

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
				{!props.embedded && props.extendedMenu && (
					<ExtendedWritingMenu
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

// (helpers removed; handled by FingerBlocker)

// (Reverted overlay helpers per v1-only change policy)



