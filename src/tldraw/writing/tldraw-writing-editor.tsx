import './tldraw-writing-editor.scss';
import { Box2d, Editor, HistoryEntry, TLDrawShape, TLRecord, TLShapeId, TLUiOverrides, Tldraw, useExportAs } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, adaptTldrawToObsidianThemeMode, getActivityType, initWritingCamera, preventTldrawCanvasesCausingObsidianGestures, silentlyChangeStore, silentlyChangeStoreAsync, stashStaleStrokes, unstashStaleStrokes } from "../../utils/tldraw-helpers";
import HandwritingContainer, { NEW_LINE_REVEAL_HEIGHT, PAGE_WIDTH } from "../writing-shapes/writing-container"
import { WritingMenuBar } from "../writing-menu-bar/writing-menu-bar";
import InkPlugin from "../../main";
import * as React from "react";
import { MENUBAR_HEIGHT_PX, WRITE_LONG_DELAY_MS, WRITE_SHORT_DELAY_MS } from 'src/constants';
import { svgToPngDataUri } from 'src/utils/screenshots';
import { InkFileData, buildWritingFileData } from 'src/utils/page-file';
import { savePngExport } from 'src/utils/file-manipulation';
import { TFile } from 'obsidian';


///////
///////


const MyCustomShapes = [HandwritingContainer];
export enum tool {
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}

const myOverrides: TLUiOverrides = {
	toolbar(editor: Editor, toolbar, { tools }) {
		const reducedToolbar = [
			toolbar[0],
			toolbar[2],
			toolbar[3]
		];
		return reducedToolbar;
	},
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



export function TldrawWritingEditor(props: {
	plugin: InkPlugin,
	fileRef: TFile,
	pageData: InkFileData,
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
	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const editorRef = useRef<Editor>();
	const [curTool, setCurTool] = React.useState<tool>(tool.draw);
	const [canUndo, setCanUndo] = React.useState<boolean>(false);
	const [canRedo, setCanRedo] = React.useState<boolean>(false);

	function undo() {
		const editor = editorRef.current
		if (!editor) return;
		silentlyChangeStore( editor, () => {
			editor.undo();
		});
	}
	function redo() {
		const editor = editorRef.current
		if (!editor) return;
		silentlyChangeStore( editor, () => {
			editor.redo();
		});
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

		if(props.embedded) {
			initWritingCamera(editor);
		} else {
			initWritingCamera(editor, MENUBAR_HEIGHT_PX);
		}

		editor.updateInstanceState({
			isDebugMode: false,
		})

		if (props.embedded) {
			editor.updateInstanceState({ canMoveCamera: false })
		}

		resizeTemplate(editor);
		resizeContainerIfEmbed(editor);
		initScrollHandler();

		// Runs on any USER caused change to the store, (Anything wrapped in silently change method doesn't call this).
		const removeUserStoreChangeListener = editor.store.listen((entry) => {

			const activity = getActivityType(entry);
			switch (activity) {
				case Activity.PointerMoved:
					// TODO: Consider whether things are being erased
					break;

				case Activity.CameraMovedAutomatically:
				case Activity.CameraMovedManually:
					console.log('camera moved');
					unstashStaleStrokes(editor);
					break;

				case Activity.DrawingStarted:
					console.log('drawing started');
					resetInputPostProcessTimers();
					stashStaleStrokes(editor);
					break;
					
				case Activity.DrawingContinued:
					console.log('drawing continued');
					resetInputPostProcessTimers();
					break;
					
				case Activity.ErasingContinued:
					console.log('erasing continued');
					resetInputPostProcessTimers();
					break;

				case Activity.DrawingCompleted:
					console.log('drawing completed');
					instantInputPostProcess(editor, entry); // REVIEW: Temporarily saving immediately as well just incase the user closes the file too quickly (But this might cause a latency issue)
					resizeTemplate(editor);
					embedPostProcess(editor);
					smallDelayInputPostProcess(editor);
					longDelayInputPostProcess(editor);
					break;

				case Activity.DrawingErased:
					console.log('drawing erased');
					instantInputPostProcess(editor, entry);
					resizeTemplate(editor);
					embedPostProcess(editor);
					break;

				default:
					console.log('default');
					// Catch anything else not specifically mentioned (ie. draw shape, etc.)
					// instantInputPostProcess(editor, entry);
					// delayedInputPostProcess(editor);
				// console.log('Activity not recognised.');
				// console.log('entry', JSON.parse(JSON.stringify(entry)) );
			}

		}, {
			source: 'user',	// Local changes
			scope: 'all'	// Filters some things like camera movement changes. But Not sure it's locked down enough, so leaving as all.
		})


		// Runs on any change to the store, caused by user, system, undo, anything, etc.
		const removeStoreChangeListener = editor.store.listen((entry) => {
			setCanUndo(editor.canUndo);
			setCanRedo(editor.canRedo);
		})


		preventTldrawCanvasesCausingObsidianGestures();
		activateDrawTool();

		const unmountActions = () => {
			// NOTE: This prevents the postProcessTimer completing when a new file is open and saving over that file.
			resetInputPostProcessTimers();
			removeUserStoreChangeListener();
			removeStoreChangeListener
			cleanUpScrollHandler();
		}

		if(props.registerControls) {
			props.registerControls({
				save: () => completeSave(editor),
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
		resizeContainerIfEmbed(editor);
	}


	const resizeContainerIfEmbed = (editor: Editor) => {
		if (!props.embedded) return;

		const embedBounds = editor.viewportScreenBounds;
		const contentBounds = getTemplateBounds(editor);
		
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

		// Because the menu bar is translated outside of the container by it's height
		// So considering the block position that much lower means it will stay visible without changing the translation
		const menuBarHeight = menuBarEl.getBoundingClientRect().height;
		blockPosY -= Number(menuBarHeight);

		const blockOffsetY = blockPosY;// - pageScrollY;

		const scrolledOffTopEdge = blockOffsetY < 0;
		if (scrolledOffTopEdge) {
			menuBarEl.style.top = Math.abs(blockOffsetY) + 'px';
		} else {
			menuBarEl.style.removeProperty('top');
		}
	}


	const getTemplateBounds = (editor: Editor): Box2d => {
		const bounds = editor.getShapePageBounds('shape:primary_container' as TLShapeId)
		
		if(bounds) {
			return bounds;
		} else {
			return new Box2d();		
		}
	}


	const resizeTemplate = (editor: Editor) => {
		let contentBounds = getWritingBounds(editor);
		if (!contentBounds) return;

		// Can't do it this way because the change in pages causes the camera to jump around
		// editor.batch( () => {
		//	const stashPage = getOrCreateStash(editor);

		// 	// Move writing container off main page so it's not considered in height
		// 	editor.moveShapesToPage(['shape:primary_container' as TLShapeId], stashPage.id);
		// 	editor.setCurrentPage(editor.pages[0]);

		// 	// Get height of leftover content
		// 	contentBounds = editor.currentPageBounds;

		// 	// Move writing container back to main page
		// 	editor.setCurrentPage(stashPage.id);
		// 	editor.moveShapesToPage(['shape:primary_container' as TLShapeId], editor.pages[0].id);
		// 	editor.setCurrentPage(editor.pages[0]);
		// })

		
		silentlyChangeStore( editor, () => {
			editor.updateShape({
				id: 'shape:primary_container' as TLShapeId,
				type: 'handwriting-container',
				isLocked: false,
			})
			
			editor.updateShape({
				id: 'shape:primary_container' as TLShapeId,
				type: 'handwriting-container',
				isLocked: true,
				props: {
					h: contentBounds.h,
				}
			})
		})
		
	}

	// Use this to run optimisations that that are quick and need to occur immediately on lifting the stylus
	const instantInputPostProcess = (editor: Editor, entry: HistoryEntry<TLRecord>) => {
		// simplifyLines(editor, entry);
	};


	// Use this to run optimisations that take a small amount of time but should happen frequently
	const smallDelayInputPostProcess = (editor: Editor) => {
		resetInputPostProcessTimers();

		shortDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				incrementalSave(editor);
			},
			WRITE_SHORT_DELAY_MS
		)

	};

	// Use this to run optimisations after a short delay
	const longDelayInputPostProcess = (editor: Editor) => {
		resetInputPostProcessTimers();

		longDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				completeSave(editor);
			},
			WRITE_LONG_DELAY_MS
		)

	};
	const resetInputPostProcessTimers = () => {
		clearTimeout(shortDelayPostProcessTimeoutRef.current);
		clearTimeout(longDelayPostProcessTimeoutRef.current);
	}


	const incrementalSave = async (editor: Editor) => {
		unstashStaleStrokes(editor);
		const tldrawData = editor.store.getSnapshot();
		stashStaleStrokes(editor);

		const pageData = buildWritingFileData({
			tldrawData,
			previewIsOutdated: true,
		})
		props.save(pageData);
	}

	const completeSave = async (editor: Editor) => {
		let previewUri;
		
		unstashStaleStrokes(editor);
		const tldrawData = editor.store.getSnapshot();
		const svgEl = await getWritingSvg(editor);
		stashStaleStrokes(editor);
		
		if (svgEl) {
			previewUri = await svgToPngDataUri(svgEl)
			// if(previewUri) addDataURIImage(previewUri)	// NOTE: Option for testing
		}

		if(previewUri) {
			const pageData = buildWritingFileData({
				tldrawData,
				previewUri,
			})
			props.save(pageData);
			savePngExport(props.plugin, previewUri, props.fileRef)

		} else {
			const pageData = buildWritingFileData({
				tldrawData,
			})
			props.save(pageData);

		}

		console.log('...Finished complete save');
	}

	



	return <>
		<div
			ref={blockElRef}
			style={{
				height: '100%',
				position: 'relative'
			}}
		>
			<Tldraw
				// TODO: Try converting snapshot into store: https://tldraw.dev/docs/persistence#The-store-prop
				snapshot = {props.pageData.tldraw}	// NOTE: Check what's causing this snapshot error??
				onMount={handleMount}
				// assetUrls = {assetUrls}
				shapeUtils={MyCustomShapes}
				overrides={myOverrides}
				hideUi
			/>
			<WritingMenuBar
				ref = {menuBarElRef}
				canUndo = {canUndo}
				canRedo = {canRedo}
				curTool = {curTool}
				onUndoClick = {undo}
				onRedoClick = {redo}
				onSelectClick = {activateSelectTool}
				onDrawClick = {activateDrawTool}
				onEraseClick = {activateEraseTool}
			/>
			{/* <div
				className = 'output-log'
				style = {{
					position: 'absolute',
					bottom: '60px',
					left: '50%',
					transform: 'translate(-50%, 0)',
					zIndex: 10000,
					backgroundColor: '#000',
					padding: '0.5em 1em'
				}}
				>
				<p>Output Log:</p>
				{outputLog}
			</div> */}
		</div>
	</>;

};







function simplifyLines(editor: Editor, entry: HistoryEntry<TLRecord>) {
	const updatedRecords = Object.values(entry.changes.updated);

	editor.batch(() => {

		updatedRecords.forEach( (record) => {
			const toRecord = record[1];
			if (toRecord.typeName == 'shape' && toRecord.type == 'draw') {
				console.log('simplifying: ', toRecord.id)
				editor.updateShape({
					id: toRecord.id,
					type: 'draw',
					props: {
						...toRecord.props,
						dash: 'solid'
					},
				})
			}
		})

	})

}





async function getWritingSvg(editor: Editor) {
	let svgEl;
	await silentlyChangeStoreAsync( editor, async () => {
		// Hide page background element
		editor.updateShape({
			id: 'shape:primary_container' as TLShapeId,
			type: 'handwriting-container',
			isLocked: false,
			opacity: 0,
		});

		// get SVG
		const allShapeIds = Array.from(editor.currentPageShapeIds.values());
		svgEl = await editor.getSvg(allShapeIds);

		// bring back page background element
		editor.updateShape({
			id: 'shape:primary_container' as TLShapeId,
			isLocked: true,
			type: 'handwriting-container',
			opacity: 1,
		});

	})

	return svgEl;
}






// TODO: This could recieve the handwritingContainer id and only check the obejcts that sit within it.
// Then again, I should parent them to it anyway, in which case it could just check it's descendants.
function getWritingBounds(editor: Editor): Box2d {
	const writingBounds = getDrawShapeBounds(editor);
	
	// Set static width
	writingBounds.x = 0;
	writingBounds.w = PAGE_WIDTH;

	// Add gap from above text as users stroke won't touch the top edge and may not be on the first line.
	writingBounds.h += writingBounds.y;
	writingBounds.y = 0;

	// Add default padding amount below
	writingBounds.h += NEW_LINE_REVEAL_HEIGHT

	return writingBounds;
}

function getDrawShapeBounds(editor: Editor): Box2d {

	const allShapes = editor.currentPageShapes;
	let bounds = new Box2d(0, 0);
	let boundsInit = false;

	if(allShapes.length) {

		// Iterate through all shapes and accumulate bounds
		for(let k=0; k<allShapes.length; k++) {
			const shape = allShapes[k];

			if (shape.type !== 'draw') continue;
			const drawShape = shape as TLDrawShape;
			if (!drawShape.props.isComplete) continue;
	
			const shapeBounds = editor.getShapePageBounds(drawShape)
			if (!shapeBounds) continue;

			if(!boundsInit) {
				// Set the bounds to match the first shape found
				bounds = shapeBounds;
				boundsInit = true;
			} else {
				// Overwrite each bound dimension only if it's an extension to the existing bound dimension

				const allLeftEdge = bounds.x;
				const allRightEdge = bounds.x + bounds.w;
				const allTopEdge = bounds.y;
				const allBottomEdge = bounds.y + bounds.h;
		
				const shapeLeftEdge = shapeBounds.x;
				const shapeRightEdge = shapeBounds.x + shapeBounds.w;
				const shapeTopEdge = shapeBounds.y;
				const shapeBottomEdge = shapeBounds.y + shapeBounds.h;
		
				if (shapeLeftEdge < allLeftEdge) {
					bounds.x = shapeLeftEdge;
				}
				if (shapeRightEdge > allRightEdge) {
					bounds.w = shapeRightEdge - bounds.x;
				}

				if (shapeTopEdge < allTopEdge) {
					bounds.y = shapeTopEdge;
				}
				if (shapeBottomEdge > allBottomEdge) {
					bounds.h = shapeBottomEdge - bounds.y;
				}
			}		
			
		};

	}

	return bounds

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

