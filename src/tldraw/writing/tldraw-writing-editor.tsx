import './tldraw-writing-editor.scss';
import { Box, Editor, HistoryEntry, StoreSnapshot, TLStoreSnapshot, TLRecord, TLShapeId, TLStore, TLUiOverrides, TLUnknownShape, Tldraw, getSnapshot, TLSerializedStore, TldrawOptions, TldrawEditor, defaultTools, defaultShapeTools, defaultShapeUtils, defaultBindingUtils, TldrawScribble, TldrawShapeIndicators, TldrawSelectionForeground, TldrawSelectionBackground, TldrawHandles } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, WritingCameraLimits, adaptTldrawToObsidianThemeMode, deleteObsoleteTemplateShapes, getActivityType, hideWritingContainer, hideWritingLines, hideWritingTemplate, initWritingCamera, initWritingCameraLimits, lockShape, prepareWritingSnapshot, preventTldrawCanvasesCausingObsidianGestures, restrictWritingCamera, silentlyChangeStore, unhideWritingContainer, unhideWritingLines, unhideWritingTemplate, unlockShape, updateWritingStoreIfNeeded, useStash } from "../../utils/tldraw-helpers";
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

///////
///////

const MyCustomShapes = [WritingContainerUtil, WritingLinesUtil];

const myOverrides: TLUiOverrides = {}

const tlOptions: Partial<TldrawOptions> = {
	defaultSvgPadding: 0,
}

const defaultComponents = {
	Scribble: TldrawScribble,
	ShapeIndicators: TldrawShapeIndicators,
	CollaboratorScribble: TldrawScribble,
	SelectionForeground: TldrawSelectionForeground,
	SelectionBackground: TldrawSelectionBackground,
	Handles: TldrawHandles,
}

export function TldrawWritingEditor(props: {
	onReady?: Function,
	plugin: InkPlugin,
	fileRef: TFile,
	pageData: InkFileData,
	save: (pageData: InkFileData) => void,

	// For embeds
	embedded?: boolean,
	registerControls?: Function,
	resizeEmbedContainer?: (pxHeight: number) => void,
	closeEditor?: Function,
	commonExtendedOptions?: any[],
}) {
	console.log('RENDERING');

	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const tldrawContainerElRef = useRef<HTMLDivElement>(null);
	const tlEditorRef = useRef<Editor>();
	const [tlStoreSnapshot] = React.useState<TLStoreSnapshot | TLSerializedStore>(prepareWritingSnapshot(props.pageData.tldraw))

	const { stashStaleContent, unstashStaleContent } = useStash(props.plugin);
	const cameraLimitsRef = useRef<WritingCameraLimits>();
	const [preventTransitions, setPreventTransitions] = React.useState<boolean>(true);

	const handleMount = (_editor: Editor) => {
		console.log('MOUNTING');
		
		const editor = tlEditorRef.current = _editor;

		updateWritingStoreIfNeeded(editor);

		// General setup
		preventTldrawCanvasesCausingObsidianGestures(editor);
		
		// tldraw content setup
		adaptTldrawToObsidianThemeMode(editor);
		resizeWritingTemplateInvitingly(editor);
		resizeContainerIfEmbed(editor);	// Has an effect if the embed is new and started at 0
		// editor.updateInstanceState({ isDebugMode: false, })
				
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
					instantInputPostProcess(editor);
					smallDelayInputPostProcess(editor);
					longDelayInputPostProcess(editor);
					break;
					
				case Activity.DrawingErased:
					instantInputPostProcess(editor);
					smallDelayInputPostProcess(editor);
					longDelayInputPostProcess(editor);
					break;
					
				default:
					// console.log('DEFAULT');
					// Catch anything else not specifically mentioned (ie. draw shape, etc.)
					// instantInputPostProcess(editor, entry);
					// smallDelayInputPostProcess(editor);
					// longDelayInputPostProcess(editor);
					// console.log('Activity not recognised.');
					// console.log('entry', JSON.parse(JSON.stringify(entry)) );
			}

		}, {
			source: 'user',	// Local changes
			scope: 'all'	// Filters some things like camera movement changes. But Not sure it's locked down enough, so leaving as all.
		})

		const unmountActions = () => {
			console.log('Running unmount actions');
			// NOTE: This prevents the postProcessTimer completing when a new file is open and saving over that file.
			resetInputPostProcessTimers();
			removeUserActionListener();
		}

		if(props.registerControls) {
			props.registerControls({
				// save: () => completeSave(editor),
				saveAndHalt: async (): Promise<void> => {
					console.log('saveAndHalt');
					await completeSave(editor);
					unmountActions();	// Clean up immediately so nothing else occurs between this completeSave and a future unmount
				},
				resize: () => {
					console.log('resize');
					const camera = editor.getCamera()
					const cameraY = camera.y;
					initWritingCamera(editor);
					editor.setCamera({x: camera.x, y: cameraY})
				}
			})
		}

		// if(props.onReady) props.onReady()

		return () => {
			console.log('UNMOUNTING');
			unmountActions();
		};
	}

	///////////////

	const resizeContainerIfEmbed = (editor: Editor) => {
		console.log('resizeContainerIfEmbed');
		if (!props.embedded) return;
		if (!tldrawContainerElRef.current) return;

		const embedBounds = editor.getViewportScreenBounds();
		const contentBounds = getTemplateBounds(editor);
		
		if (contentBounds) {
			const contentRatio = contentBounds.w / contentBounds.h;
			const newEmbedHeight = embedBounds.w / contentRatio;
			tldrawContainerElRef.current.style.height = newEmbedHeight + 'px';
		}

	}

	const getTemplateBounds = (editor: Editor): Box => {
		console.log('getTemplateBounds');
		const bounds = editor.getShapePageBounds('shape:writing-container' as TLShapeId)
		
		if(bounds) {
			return bounds;
		} else {
			return new Box();
		}
	}

	// REVIEW: Some of these can be moved out of the function

	const queueOrRunStorePostProcesses = (editor: Editor) => {
		instantInputPostProcess(editor);
		smallDelayInputPostProcess(editor);
		longDelayInputPostProcess(editor);
	}

	// Use this to run optimisations that that are quick and need to occur immediately on lifting the stylus
	const instantInputPostProcess = (editor: Editor) => { //, entry?: HistoryEntry<TLRecord>) => {
		console.log('instantInputPostProcess STARTED');
		resizeWritingTemplateInvitingly(editor);
		resizeContainerIfEmbed(editor);
		// entry && simplifyLines(editor, entry);
	};

	// Use this to run optimisations that take a small amount of time but should happen frequently
	const smallDelayInputPostProcess = (editor: Editor) => {
		console.log('smallDelayInputPostProcess queued');
		resetShortPostProcessTimer();
		
		shortDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				console.log('smallDelayInputPostProcess STARTED');
				incrementalSave(editor);
			},
			WRITE_SHORT_DELAY_MS
		)

	};

	// Use this to run optimisations after a slight delay
	const longDelayInputPostProcess = (editor: Editor) => {
		console.log('longDelayInputPostProcess queued');
		resetLongPostProcessTimer();
		
		longDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				console.log('longDelayInputPostProcess STARTED');
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
		console.log('incrementalSave');
		unstashStaleContent(editor);
		const tlEditorSnapshot = getSnapshot(editor.store);
		const tlStoreSnapshot = tlEditorSnapshot.document;
		stashStaleContent(editor);

		const pageData = buildWritingFileData({
			tlStoreSnapshot,
			previewIsOutdated: true,
		})
		props.save(pageData);
	}

	const completeSave = async (editor: Editor): Promise<void> => {
		console.log('completeSave');
		let previewUri;
		
		unstashStaleContent(editor);
		const tlEditorSnapshot = getSnapshot(editor.store);
		const tlStoreSnapshot = tlEditorSnapshot.document;
		const svgObj = await getWritingSvg(editor);
		stashStaleContent(editor);
		
		if (svgObj) {
			previewUri = svgObj.svg;//await svgToPngDataUri(svgObj)
			// if(previewUri) addDataURIImage(previewUri)	// NOTE: Option for testing
		}

		if(previewUri) {
			const pageData = buildWritingFileData({
				tlStoreSnapshot,
				previewUri,
			})
			props.save(pageData);
			// await savePngExport(props.plugin, previewUri, props.fileRef) // REVIEW: Still need a png?

		} else {
			const pageData = buildWritingFileData({
				tlStoreSnapshot,
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
			ref = {tldrawContainerElRef}
			className = {classNames([
				"ddc_ink_writing-editor",
			])}
			style={{
				height: '100%',
				position: 'relative',
			}}
		>
			<TldrawEditor
				options = {tlOptions}
				shapeUtils = {[...defaultShapeUtils, ...MyCustomShapes]}
				tools = {[...defaultTools, ...defaultShapeTools]}
				initialState = "draw"
				snapshot = {tlStoreSnapshot}
				// persistenceKey = {props.fileRef.path}

				// bindingUtils = {defaultBindingUtils}
				components = {defaultComponents}

				onMount = {handleMount}
			/>

			<PrimaryMenuBar>
				<WritingMenu
					getTlEditor = {getTlEditor}
					onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
				/>
				{props.embedded && props.commonExtendedOptions && (
					<ExtendedWritingMenu
						onLockClick = { async () => {
							// REVIEW: Save immediately? incase it hasn't been saved yet
							if(props.closeEditor) props.closeEditor();
						}}
						menuOptions = {props.commonExtendedOptions}
					/>
				)}
			</PrimaryMenuBar>

		</div>
	</>;

};

///////////
///////////

interface svgObj {
	height: number,
	width: number,
	svg: string,
};

async function getWritingSvg(editor: Editor): Promise<svgObj | undefined> {
	console.log('getWritingSvg')
	let svgObj: undefined | svgObj;
	
	resizeWritingTemplateTightly(editor);

	const allShapeIds = Array.from(editor.getCurrentPageShapeIds().values());
	svgObj = await editor.getSvgString(allShapeIds);

	resizeWritingTemplateInvitingly(editor);

	return svgObj;
}

// REVIEW: This could recieve the handwritingContainer id and only check the obejcts that sit within it.
// Then again, I should parent them to it anyway, in which case it could just check it's descendants.
function getAllStrokeBounds(editor: Editor): Box {
	const allStrokeBounds = getDrawShapeBounds(editor);
	
	// Set static width
	allStrokeBounds.x = 0;
	allStrokeBounds.w = WRITING_PAGE_WIDTH;
	
	// Add gap from above text as users stroke won't touch the top edge and may not be on the first line.
	allStrokeBounds.h += allStrokeBounds.y;
	allStrokeBounds.y = 0;

	return allStrokeBounds;
}

function getDrawShapeBounds(editor: Editor): Box {
	hideWritingTemplate(editor);
	let bounds = editor.getCurrentPageBounds() || new Box(0,0)
	unhideWritingTemplate(editor);
	return bounds
}

function simplifyLines(editor: Editor, entry: HistoryEntry<TLRecord>) {
	// const updatedRecords = Object.values(entry.changes.updated);

	// editor.run(() => {

	// 	updatedRecords.forEach( (record) => {
	// 		const toRecord = record[1];
	// 		if (toRecord.typeName == 'shape' && toRecord.type == 'draw') {
	// 			editor.updateShape({
	// 				id: toRecord.id,
	// 				type: 'draw',
	// 				props: {
	// 					...toRecord.props,
	// 					// dash: 'draw', // Sets to dynamic stroke thickness
	// 					dash: 'solid', // Sets to constant stroke thickness
	// 					// isPen: true,
	// 				},
	// 			}, {
	// 				ephemeral: true
	// 			})
	// 		}
	// 	})

	// })

}


function isEmptyWritingFile(editor: Editor): boolean {
	let contentBounds = getDrawShapeBounds(editor);
	if(contentBounds.height === 0) {
		return true;
	} else {
		return false;
	}
}

/***
 * Convert an existing writing height to a value with just enough space under writing strokes to view baseline.
 * Good for screenshots and other non-interactive states.
 */
function cropWritingStrokeHeightTightly(height: number): number {
	const numOfLines = Math.ceil(height / WRITING_LINE_HEIGHT);
	const newLineHeight = (numOfLines + 0.5) * WRITING_LINE_HEIGHT;
	return Math.max(newLineHeight, WRITING_MIN_PAGE_HEIGHT)
}

/***
 * Convert an existing writing height to a value with excess space under writing strokes to to enable further writing.
 * Good for while in editing mode.
 */
function cropWritingStrokeHeightInvitingly(height: number): number {
	const numOfLines = Math.ceil(height / WRITING_LINE_HEIGHT);
	const newLineHeight = (numOfLines + 1.5) * WRITING_LINE_HEIGHT;
	return Math.max(newLineHeight, WRITING_MIN_PAGE_HEIGHT)
}


/***
 * Add excess space under writing strokes to to enable further writing.
 * Good for while in editing mode.
 */
const resizeWritingTemplateInvitingly = (editor: Editor) => {
	console.log('resizeWritingTemplateInvitingly');
	let contentBounds = getAllStrokeBounds(editor);
	if (!contentBounds) return;

	contentBounds.h = cropWritingStrokeHeightInvitingly(contentBounds.h);

	const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId) as WritingLines;
	const writingContainerShape = editor.getShape('shape:writing-container' as TLShapeId) as WritingContainer;
	
	if(!writingLinesShape) return;
	if(!writingContainerShape) return;
	
	silentlyChangeStore( editor, () => {
		unlockShape(editor, writingContainerShape);
		unlockShape(editor, writingLinesShape);
		// resize container and lines
		editor.updateShape({
			id: writingContainerShape.id,
			type: writingContainerShape.type,
			props: {
				h: contentBounds.h,
			}
		})
		editor.updateShape({
			id: writingLinesShape.id,
			type: writingLinesShape.type,
			props: {
				h: contentBounds.h,
			}
		})
		lockShape(editor, writingContainerShape);
		lockShape(editor, writingLinesShape);
	})
	
}

/***
 * Add just enough space under writing strokes to view baseline.
 * Good for screenshots and other non-interactive states.
 */
const resizeWritingTemplateTightly = (editor: Editor) => {
	console.log('resizeWritingTemplateTightly')
	let contentBounds = getAllStrokeBounds(editor);
	if (!contentBounds) return;

	contentBounds.h = cropWritingStrokeHeightTightly(contentBounds.h);

	const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId) as WritingLines;
	const writingContainerShape = editor.getShape('shape:writing-container' as TLShapeId) as WritingContainer;
	
	
	silentlyChangeStore( editor, () => {
		unlockShape(editor, writingContainerShape);
		unlockShape(editor, writingLinesShape);
		// resize container and lines
		editor.updateShape({
			id: writingContainerShape.id,
			type: writingContainerShape.type,
			props: {
				h: contentBounds.h,
			}
		})
		editor.updateShape({
			id: writingLinesShape.id,
			type: writingLinesShape.type,
			props: {
				h: contentBounds.h,
			}
		})
		lockShape(editor, writingContainerShape);
		lockShape(editor, writingLinesShape);
	})

	
}


