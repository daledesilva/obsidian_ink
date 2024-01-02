import './tldraw-drawing-editor.scss';
import { Box2d, Editor, HistoryEntry, TLDrawShape, TLPage, TLPageId, TLRecord, TLShape, TLUiOverrides, Tldraw, setUserPreferences, useExportAs } from "@tldraw/tldraw";
import { useRef } from "react";
import { adaptTldrawToObsidianThemeMode, initDrawingCamera, preventTldrawCanvasesCausingObsidianGestures, removeExtensionAndDotFromFilepath } from "../../utils/helpers";
import HandwritingContainer from "../writing-shapes/writing-container"
import InkPlugin from "../../main";
import * as React from "react";
import { MENUBAR_HEIGHT_PX } from 'src/constants';
import { svgToPngDataUri } from 'src/utils/screenshots';
import { FileSystemAdapter, TFile } from 'obsidian';
import { savePngExport } from 'src/utils/file-manipulation';
import { InkFileData, buildDrawingFileData } from 'src/utils/page-file';


///////
///////

const PAUSE_BEFORE_FULL_SAVE_MS = 2000;

const MyCustomShapes = [HandwritingContainer];
export enum tool {
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}

let hiddenShapes: TLShape[] = [];

const myOverrides: TLUiOverrides = {
	// toolbar(editor: Editor, toolbar, { tools }) {
	// 	const reducedToolbar = [
	// 		toolbar[0],
	// 		toolbar[2],
	// 		toolbar[3]
	// 	];
	// 	return reducedToolbar;
	// },
	// actionsMenu(editor: Editor, actionsMenu, {actions}) {
	// 	console.log('actionsMenu', actionsMenu);
	// 	// const reducedToolbar = [
	// 	// 	toolbar[0],
	// 	// 	toolbar[2],
	// 	// 	toolbar[3]
	// 	// ]
	// 	return actionsMenu;
	// }
}



export function TldrawDrawingEditor(props: {
	plugin: InkPlugin,
	pageData: InkFileData,
	fileRef: TFile,
	save: (pageData: InkFileData) => void,

	// For embeds
	embedded?: boolean,
	registerControls?: Function,
	resizeEmbedContainer?: (pxHeight: number) => void,
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const scrollContainerElRef = useRef<HTMLDivElement>(null);
	const blockElRef = useRef<HTMLDivElement>(null)
	const menuBarElRef = useRef<HTMLDivElement>(null);
	const [outputLog, setOutputLog] = React.useState('This is the output log');
	const postProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const justProcessedRef = useRef<boolean>(false);
	const editorRef = useRef<Editor>();
	const [curTool, setCurTool] = React.useState<tool>(tool.draw);
	const [canUndo, setCanUndo] = React.useState<boolean>(false);
	const [canRedo, setCanRedo] = React.useState<boolean>(false);
	const exportAs = useExportAs();

	function undo() {
		const editor = editorRef.current
		if (!editor) return;
		editor.undo();
	}
	function redo() {
		const editor = editorRef.current
		if (!editor) return;
		editor.redo();
	}
	function activateSelectTool() {
		const editor = editorRef.current
		if (!editor) return;
		editor.setCurrentTool('select');
		setCurTool(tool.select);

	}
	function activateDrawTool() {
		const editor = editorRef.current
		if (!editor) return;
		editor.setCurrentTool('draw');
		setCurTool(tool.draw);
	}
	function activateEraseTool() {
		const editor = editorRef.current
		if (!editor) return;
		editor.setCurrentTool('eraser');
		setCurTool(tool.eraser);
	}
	



	const handleMount = (_editor: Editor) => {
		const editor = editorRef.current = _editor;

		adaptTldrawToObsidianThemeMode();

		unstashOldShapes(editor);

		initDrawingCamera(editor);
		editor.updateInstanceState({
			isDebugMode: false,
			// isGridMode: true,	// REVIEW: Turned off for now because it forces snapping
		})

		if (props.embedded) {
			editor.updateInstanceState({ canMoveCamera: false })
		}

		// resizeContainerIfEmbed(editor);
		initScrollHandler();

		const removeStoreListener = editor.store.listen((entry) => {

			// setCanUndo(editor.canUndo);
			// setCanRedo(editor.canRedo);

			// Bail if this listener fired because again of changes made in the listener itself
			if (justProcessedRef.current) {
				justProcessedRef.current = false;
				return;
			}

			const activity = getActivityType(entry);
			switch (activity) {
				case Activity.PointerMoved:
					// TODO: Consider whether things are being erased
					break;

				case Activity.CameraMovedAutomatically:
				case Activity.CameraMovedManually:
					// NOTE: Can't do this because it switches pages and back and causes the the camera to jump around
					// unstashOldShapes(editor);
					// justProcessedRef.current = true;
					break;

				case Activity.DrawingStarted:
					resetInputPostProcessTimer();
					// stashOldShapes(editor); // NOTE: Can't do this while user is drawing because it changes pages and back, which messes with the stroke.
					break;

				case Activity.DrawingContinued:
					resetInputPostProcessTimer();
					break;

				case Activity.DrawingCompleted:
					incrementalSave(editor); // REVIEW: Temporarily saving immediately as well just incase the user closes the file too quickly (But this might cause a latency issue)
					embedPostProcess(editor);
					delayedPostProcess(editor);
					break;

				case Activity.DrawingErased:
					incrementalSave(editor);
					embedPostProcess(editor);
					break;

				default:
					// Catch anything else not specifically mentioned (ie. erase, draw shape, etc.)
					incrementalSave(editor);
					delayedPostProcess(editor);
				// console.log('Activity not recognised.');
				// console.log('entry', JSON.parse(JSON.stringify(entry)) );
			}

		}, {
			source: 'user',	// Local changes
			scope: 'all'	// Filters some things like camera movement changes. But Not sure it's locked down enough, so leaving as all.
		})


		preventTldrawCanvasesCausingObsidianGestures();
		activateDrawTool();

		const unmountActions = () => {
			// NOTE: This prevents the postProcessTimer completing when a new file is open and saving over that file.
			resetInputPostProcessTimer();
			removeStoreListener();
			cleanUpScrollHandler();
		}

		if(props.registerControls) {
			props.registerControls({
				save: async () => await completeSave(editor),
				saveAndHalt: async () => {
					await completeSave(editor)
					unmountActions();	// Clean up immediately so nothing else occurs between this completeSave and a future unmount
				},
			})
		}

		return () => {
			unmountActions();
		};
	}




	const embedPostProcess = (editor: Editor) => {
		// resizeContainerIfEmbed(editor);
	}


	const resizeContainerIfEmbed = (editor: Editor) => {
		if (!props.embedded) return;

		const embedBounds = editor.viewportScreenBounds;
		const contentBounds = editor.currentPageBounds;

		if (contentBounds) {
			const contentRatio = contentBounds.w / contentBounds.h;
			const embedHeight = embedBounds.w / contentRatio;
			if(blockElRef.current) {
				blockElRef.current.style.height = embedHeight + 'px';
			}
		}
	}

	const initScrollHandler = () => {
		const menuBarEl = menuBarElRef.current;
		const scrollEl = menuBarEl?.closest(".cm-scroller");
		scrollEl?.addEventListener('scroll', handleScrolling);
	}
	const cleanUpScrollHandler = () => {
		const scrollEl = scrollContainerElRef.current;
		scrollEl?.removeEventListener('scroll', handleScrolling);
	}

	const handleScrolling = (e: Event): void => {
		const scrollEl = e.target as HTMLDivElement;
		const pageScrollY = scrollEl.scrollTop;

		const menuBarEl = menuBarElRef.current;
		const blockEl = blockElRef.current;
		if (!menuBarEl) return;
		if (!blockEl) return;

		let blockPosY = blockEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top || 0;
		const blockOffsetY = blockPosY;// - pageScrollY;

		const scrolledOffTopEdge = blockOffsetY < 0;
		if (scrolledOffTopEdge) {
			menuBarEl.style.top = Math.abs(blockOffsetY) + 'px';
		}
	}

	const resetInputPostProcessTimer = () => {
		clearTimeout(postProcessTimeoutRef.current);
	}

	// Use this to run optimisations after a short delay
	const delayedPostProcess = (editor: Editor) => {
		resetInputPostProcessTimer();

		postProcessTimeoutRef.current = setTimeout(
			() => {
				// Save content
				completeSave(editor);
				justProcessedRef.current = true;
			},
			PAUSE_BEFORE_FULL_SAVE_MS
		)

	};


	const incrementalSave = async (editor: Editor) => {
		const tldrawData = editor.store.getSnapshot();

		const pageData = buildDrawingFileData({
			tldrawData,
			previewIsOutdated: true,
		})
		props.save(pageData);
	}


	const completeSave = async (editor: Editor) => {
		
		let previewUri;
		const tldrawData = editor.store.getSnapshot();
		
		// get SVG
		const allShapeIds = Array.from(editor.currentPageShapeIds.values());
		const svgEl = await editor.getSvg(allShapeIds);
		
		if (svgEl) {
			previewUri = await svgToPngDataUri(svgEl)
			// if(previewUri) addDataURIImage(previewUri)	// NOTE: Option for testing
		}
		
		if(previewUri) {
			savePngExport(props.plugin, previewUri, props.fileRef)

			const pageData = buildDrawingFileData({
				tldrawData,
				previewUri,
			})
			props.save(pageData);

		} else {
			const pageData = buildDrawingFileData({
				tldrawData,
			})
			props.save(pageData);

		}

	}




	return <>
		<div
			ref = {blockElRef}
			style = {{
				height: '100%',
				position: 'relative'
			}}
		>
			<Tldraw
				// TODO: Try converting snapshot into store: https://tldraw.dev/docs/persistence#The-store-prop
				snapshot = {props.pageData.tldraw}	// NOTE: Check what's causing this snapshot error??
				// persistenceKey = {props.filepath}
				onMount = {handleMount}
				// assetUrls = {assetUrls}
				// shapeUtils={MyCustomShapes}
				overrides = {myOverrides}
				// hideUi
			/>
		</div>
	</>;

};

export default TldrawDrawingEditor;









const stashOldShapes = (editor: Editor) => {
	// editor.batch( () => {

	const completeShapes = getCompleteShapes(editor);
	const stashPage = getOrCreateStash(editor);

	let olderShapes: TLShape[] = [];
	let recentCount = 300;	// The number of recent strokes to keep visible

	// TODO: Order isn't guaranteed. Need to order by vertical position first
	for (let i = 0; i <= completeShapes.length - recentCount; i++) {
		const record = completeShapes[i];
		if (record.type != 'draw') return;

		olderShapes.push(record as TLShape);
	}

	editor.moveShapesToPage(olderShapes, stashPage.id);
	editor.setCurrentPage(editor.pages[0]);

	// })
}



enum Activity {
	PointerMoved,
	CameraMovedManually,
	CameraMovedAutomatically,
	DrawingStarted,
	DrawingContinued,
	DrawingCompleted,
	DrawingErased,
	ErasingContinued,
	Unclassified,
}


function getActivityType(entry: HistoryEntry<TLRecord>): Activity {
	const activitySummary = getActivitySummary(entry);

	if (activitySummary.drawShapesCompleted) return Activity.DrawingCompleted;	// Note, this overules everything else
	if (activitySummary.drawShapesStarted) return Activity.DrawingStarted;
	if (activitySummary.drawShapesContinued) return Activity.DrawingContinued;
	if (activitySummary.drawShapesRemoved) return Activity.DrawingErased;

	if (activitySummary.cameraMoved && activitySummary.pointerMoved) return Activity.CameraMovedManually;
	if (activitySummary.cameraMoved && !activitySummary.pointerMoved) return Activity.CameraMovedAutomatically;

	if (activitySummary.pointerScribbled) return Activity.ErasingContinued;
	if (activitySummary.pointerMoved) return Activity.PointerMoved;

	return Activity.Unclassified;
}


function getOrCreateStash(editor: Editor): TLPage {
	let page = editor.getPage('page:stash' as TLPageId);
	if (!page) {
		let testPage = editor.createPage({
			id: 'page:stash' as TLPageId,
			name: 'Stash'
		});
		page = editor.getPage('page:stash' as TLPageId)!;
	}
	return page;
}

function unstashOldShapes(editor: Editor): TLShape[] | undefined {
	const stashPage = editor.getPage('page:stash' as TLPageId);
	if (!stashPage) return;

	let allStashShapes: TLShape[] | undefined;
	editor.batch(() => {
		const curPageId = editor.currentPageId;
		editor.setCurrentPage(stashPage);
		allStashShapes = editor.currentPageShapes;
		editor.moveShapesToPage(allStashShapes, curPageId);
		editor.setCurrentPage(curPageId);
	})

	return allStashShapes;
}





function getActivitySummary(entry: HistoryEntry<TLRecord>) {
	const summary = {
		pointerMoved: false,
		pointerScribbled: false,
		cameraMoved: false,
		drawShapesStarted: 0,
		drawShapesContinued: 0,
		drawShapesCompleted: 0,
		drawShapesRemoved: 0,
	}

	const addedRecords = Object.values(entry.changes.added);
	if (addedRecords) {
		for (let i = 0; i < addedRecords.length; i++) {
			const record = addedRecords[i];
			if (record.typeName == 'shape' && record.type == 'draw') {
				summary.drawShapesStarted += 1;
				if (record.props.isComplete === true) {
					summary.drawShapesCompleted += 1;
				};
			}
		}
	}

	const updatedRecords = Object.values(entry.changes.updated);
	if (updatedRecords) {
		for (let i = 0; i < updatedRecords.length; i++) {
			const recordFinalState = updatedRecords[i][1];
			if (recordFinalState.typeName == 'shape' && recordFinalState.type == 'draw') {
				if (recordFinalState.props.isComplete === true) {
					summary.drawShapesCompleted += 1;
				} else {
					summary.drawShapesContinued += 1;
				}
			} else if (recordFinalState.typeName == 'pointer') {
				summary.pointerMoved = true;
			} else if (recordFinalState.typeName == 'camera') {
				summary.cameraMoved = true;
			} else if (recordFinalState.typeName == 'instance') {
				if (recordFinalState.scribble) summary.pointerScribbled = true;
			}
		}
	}

	const removedRecords = Object.values(entry.changes.removed);
	if (removedRecords) {
		for (let i = 0; i < removedRecords.length; i++) {
			const record = removedRecords[i];
			if (record.typeName == 'shape' && record.type == 'draw') {
				summary.drawShapesRemoved += 1;
			}
		}
	}

	return summary;
}



// TODO: This could recieve the handwritingContainer id and only check the obejcts that sit within it.
// Then again, I should parent them to it anyway, in which case it could just check it's descendants.
function getWritingBounds(editor: Editor): Box2d {
	const allBounds = new Box2d(100000, 100000);	// x and y overlay high so the first shape overrides it

	const allShapes = editor.currentPageShapes;

	allShapes.forEach((shape) => {
		if (shape.type != 'draw') return;
		const drawShape = shape as TLDrawShape;
		if (!drawShape.props.isComplete) return;

		const shapeBounds = editor.getShapePageBounds(drawShape)
		if (!shapeBounds) return;

		const allLeftEdge = allBounds.x;
		const allRightEdge = allBounds.x + allBounds.w;
		const allTopEdge = allBounds.y;
		const allBottomEdge = allBounds.y + allBounds.h;

		const shapeLeftEdge = shapeBounds.x;
		const shapeRightEdge = shapeBounds.x + shapeBounds.w;
		const shapeTopEdge = shapeBounds.y;
		const shapeBottomEdge = shapeBounds.y + shapeBounds.h;

		if (shapeLeftEdge < allLeftEdge) {
			allBounds.x = shapeLeftEdge;
		}
		if (shapeRightEdge > allRightEdge) {
			allBounds.w = allRightEdge - allBounds.x;
		}
		if (shapeTopEdge < allTopEdge) {
			allBounds.y = shapeTopEdge;
		}
		if (shapeBottomEdge > allBottomEdge) {
			allBounds.h = shapeBottomEdge - allBounds.y;
		}
	})

	// Add gap from above text if user chose not to start on first line.
	allBounds.h += allBounds.y;
	allBounds.y = 0;

	return allBounds;
}



function getCompleteShapes(editor: Editor) {
	const allShapes = editor.currentPageShapes;
	let completeShapes: TLShape[] = [];
	for (let i = 0; i < allShapes.length; i++) {
		const shape = allShapes[i];
		if (shape.props.isComplete === true) completeShapes.push(shape);
	}

	// Order according to y position
	completeShapes.sort((a, b) => {
		return a.y - b.y
	});

	return completeShapes;
}

function getIncompleteShapes(editor: Editor) {
	const allShapes = editor.currentPageShapes;
	let incompleteShapes: TLShape[] = [];
	for (let i = 0; i < allShapes.length; i++) {
		const shape = allShapes[i];
		if (shape.props.isComplete === false) incompleteShapes.push(shape);
	}
	return incompleteShapes;
}












function addDataURIImage(dataURI: string) {
	// Create an image element
	const imageElement = document.createElement('img');
	imageElement.src = dataURI;

	// Set absolute positioning and center alignment
	imageElement.style.position = 'absolute';
	imageElement.style.top = '50%';
	imageElement.style.left = '50%';
	imageElement.style.width = '50%';
	imageElement.style.transform = 'translate(-50%, -50%)';

	// Set z-index to ensure it's on top of everything else
	imageElement.style.zIndex = '9999';

	// Append the image element to the body
	document.body.appendChild(imageElement);
}

