import './tldraw-writing-editor.scss';
import { Box, Editor, HistoryEntry, StoreSnapshot, TLStoreSnapshot, TLRecord, TLShapeId, TLStore, TLUiOverrides, TLUnknownShape, Tldraw, getSnapshot, TLSerializedStore, TldrawOptions, TldrawEditor, defaultTools, defaultShapeTools, defaultShapeUtils, defaultBindingUtils, TldrawScribble, TldrawShapeIndicators, TldrawSelectionForeground, TldrawSelectionBackground, TldrawHandles, TLEditorSnapshot } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, WritingCameraLimits, adaptTldrawToObsidianThemeMode, deleteObsoleteWritingTemplateShapes, focusChildTldrawEditor, getActivityType, getWritingContainerBounds, getWritingSvg, hideWritingContainer, hideWritingLines, hideWritingTemplate, initWritingCamera, initWritingCameraLimits, lockShape, prepareWritingSnapshot, preventTldrawCanvasesCausingObsidianGestures, resizeWritingTemplateInvitingly, restrictWritingCamera, silentlyChangeStore, unhideWritingContainer, unhideWritingLines, unhideWritingTemplate, unlockShape, updateWritingStoreIfNeeded, useStash } from "../../utils/tldraw-helpers";
import { WritingContainer, WritingContainerUtil } from "../writing-shapes/writing-container"
import { WritingMenu } from "../writing-menu/writing-menu";
import InkPlugin from "../../main";
import * as React from "react";
import { MENUBAR_HEIGHT_PX, WRITE_LONG_DELAY_MS, WRITE_SHORT_DELAY_MS, WRITING_LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';
import { InkFileData, buildWritingFileData } from 'src/utils/page-file';
import { TFile } from 'obsidian';
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
import StyleMenu from '../style-menu/style-menu';

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
	const editorWrapperRefEl = useRef<HTMLDivElement>(null);
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

			<SecondaryMenuBar>
				<ModifyMenu
					getTlEditor = {getTlEditor}
					onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
				/>
				<StyleMenu
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



