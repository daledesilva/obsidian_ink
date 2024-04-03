import './tldraw-writing-editor.scss';
import { Box, Editor, HistoryEntry, TLDrawShape, TLRecord, TLShapeId, TLUiOverrides, Tldraw } from "@tldraw/tldraw";
import { useRef } from "react";
import { Activity, WritingCameraLimits, adaptTldrawToObsidianThemeMode, getActivityType, initWritingCamera, initWritingCameraLimits, preventTldrawCanvasesCausingObsidianGestures, restrictWritingCamera, silentlyChangeStore, useStash } from "../../utils/tldraw-helpers";
import HandwritingContainer, { NEW_LINE_REVEAL_HEIGHT, PAGE_WIDTH } from "../writing-shapes/writing-container"
import { WritingMenu } from "../writing-menu/writing-menu";
import InkPlugin from "../../main";
import * as React from "react";
import { MENUBAR_HEIGHT_PX, WRITE_LONG_DELAY_MS, WRITE_SHORT_DELAY_MS } from 'src/constants';
import { svgToPngDataUri } from 'src/utils/screenshots';
import { InkFileData, buildWritingFileData } from 'src/utils/page-file';
import { savePngExport } from 'src/utils/file-manipulation';
import { TFile } from 'obsidian';
import { PrimaryMenuBar } from '../primary-menu-bar/primary-menu-bar';
import ExtendedWritingMenu from '../extended-writing-menu/extended-writing-menu';

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
	switchToReadOnly?: Function,
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const containerElRef = React.useRef<HTMLDivElement>(null)
	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const editorRef = useRef<Editor>();
	const [curTool, setCurTool] = React.useState<tool>(tool.draw);
	const [canUndo, setCanUndo] = React.useState<boolean>(false);
	const [canRedo, setCanRedo] = React.useState<boolean>(false);
	const { stashStaleContent, unstashStaleContent } = useStash();
	const cameraLimitsRef = useRef<WritingCameraLimits>();

	function undo() {
		const editor = editorRef.current
		if (!editor) return;
		silentlyChangeStore( editor, () => {
			editor.undo();
		});
		instantInputPostProcess(editor);
		resizeTemplate(editor);
		embedPostProcess(editor);
		smallDelayInputPostProcess(editor);
		longDelayInputPostProcess(editor);
	}
	function redo() {
		const editor = editorRef.current
		if (!editor) return;
		silentlyChangeStore( editor, () => {
			editor.redo();
		});
		instantInputPostProcess(editor);
		resizeTemplate(editor);
		embedPostProcess(editor);
		smallDelayInputPostProcess(editor);
		longDelayInputPostProcess(editor);

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

		// General setup
		resizeContainerIfEmbed(editor);
		preventTldrawCanvasesCausingObsidianGestures();
		
		// tldraw content setup
		adaptTldrawToObsidianThemeMode(editor);
		resizeTemplate(editor);
		editor.updateInstanceState({ isDebugMode: false, })
		
		// view set up
		activateDrawTool();
		if(props.embedded) {
			initWritingCamera(editor);
			editor.updateInstanceState({ canMoveCamera: false })
		} else {
			initWritingCamera(editor, MENUBAR_HEIGHT_PX);
			cameraLimitsRef.current = initWritingCameraLimits(editor);
		}

		// Runs on any USER caused change to the store, (Anything wrapped in silently change method doesn't call this).
		const removeUserActionListener = editor.store.listen((entry) => {

			const activity = getActivityType(entry);
			switch (activity) {
				case Activity.PointerMoved:
					// TODO: Consider whether things are being erased
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
					
				case Activity.ErasingContinued:
					resetInputPostProcessTimers();
					break;

				case Activity.DrawingCompleted:
					instantInputPostProcess(editor, entry);
					resizeTemplate(editor);	// REVIEW: This could go inside a post process
					embedPostProcess(editor);	// REVIEW: This could go inside a post process
					smallDelayInputPostProcess(editor);
					longDelayInputPostProcess(editor);
					break;

				case Activity.DrawingErased:
					instantInputPostProcess(editor, entry);
					resizeTemplate(editor);
					embedPostProcess(editor);
					smallDelayInputPostProcess(editor);
					longDelayInputPostProcess(editor);
					break;

				default:
					// Catch anything else not specifically mentioned (ie. draw shape, etc.)
					instantInputPostProcess(editor, entry);
					smallDelayInputPostProcess(editor);
					longDelayInputPostProcess(editor);
					// console.log('Activity not recognised.');
					// console.log('entry', JSON.parse(JSON.stringify(entry)) );
			}

		}, {
			source: 'user',	// Local changes
			scope: 'all'	// Filters some things like camera movement changes. But Not sure it's locked down enough, so leaving as all.
		})

		// Runs on any change to the store, caused by user, system, undo, anything, etc.
		const removeStoreChangeListener = editor.store.listen((entry) => {
			setCanUndo(editor.getCanUndo());
			setCanRedo(editor.getCanRedo());
		})

		const unmountActions = () => {
			// NOTE: This prevents the postProcessTimer completing when a new file is open and saving over that file.
			resetInputPostProcessTimers();
			removeUserActionListener();
			removeStoreChangeListener();
		}

		if(props.registerControls) {
			props.registerControls({
				// save: () => completeSave(editor),
				saveAndHalt: async () => {
					completeSave(editor)
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

	const embedPostProcess = (editor: Editor) => {
		resizeContainerIfEmbed(editor);
	}

	const resizeContainerIfEmbed = (editor: Editor) => {
		if (!props.embedded) return;

		const embedBounds = editor.getViewportScreenBounds();
		const contentBounds = getTemplateBounds(editor);
		
		if (contentBounds) {

			const contentRatio = contentBounds.w / contentBounds.h;
			const embedHeight = embedBounds.w / contentRatio;
			if(containerElRef.current) {
				containerElRef.current.style.height = embedHeight + 'px';
			}
		}
	}

	const getTemplateBounds = (editor: Editor): Box => {
		const bounds = editor.getShapePageBounds('shape:primary_container' as TLShapeId)
		
		if(bounds) {
			return bounds;
		} else {
			return new Box();		
		}
	}

	// REVIEW: Some of these can be moved out of the function
	const resizeTemplate = (editor: Editor) => {
		let contentBounds = getWritingBounds(editor);
		if (!contentBounds) return;
		
		silentlyChangeStore( editor, () => {
			editor.updateShape({
				id: 'shape:primary_container' as TLShapeId,
				type: 'handwriting-container',
				isLocked: false,
			}, {
				ephemeral: true
			})
			
			editor.updateShape({
				id: 'shape:primary_container' as TLShapeId,
				type: 'handwriting-container',
				isLocked: true,
				props: {
					h: contentBounds.h,
				}
			}, {
				ephemeral: true
			})
		})
		
	}

	// Use this to run optimisations that that are quick and need to occur immediately on lifting the stylus
	const instantInputPostProcess = (editor: Editor, entry?: HistoryEntry<TLRecord>) => {
		// simplifyLines(editor, entry);
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
		unstashStaleContent(editor);
		const tldrawData = editor.store.getSnapshot();
		stashStaleContent(editor);

		const pageData = buildWritingFileData({
			tldrawData,
			previewIsOutdated: true,
		})
		props.save(pageData);
		// console.log('...Finished incremental WRITING save');
	}

	const completeSave = async (editor: Editor) => {
		let previewUri;
		
		unstashStaleContent(editor);
		const tldrawData = editor.store.getSnapshot();
		const svgEl = await getWritingSvg(editor);
		stashStaleContent(editor);
		
		if (svgEl) {
			// console.log('no SVG');
			previewUri = await svgToPngDataUri(svgEl)
			// if(previewUri) addDataURIImage(previewUri)	// NOTE: Option for testing
		}

		if(previewUri) {
			const pageData = buildWritingFileData({
				tldrawData,
				previewUri,
			})
			props.save(pageData);
			await savePngExport(props.plugin, previewUri, props.fileRef)

		} else {
			const pageData = buildWritingFileData({
				tldrawData,
			})
			props.save(pageData);
		}

		// console.log('...Finished complete WRITING save');
	}

	const assetUrls = {
		icons: {
			'tool-hand': './custom-tool-hand.svg',
		},
	}


	// console.log('test');

	return <>
		<div
			ref={containerElRef}
			style={{
				height: '100%',
				position: 'relative'
			}}
		>
			<Tldraw
				// REVIEW: Try converting snapshot into store: https://tldraw.dev/docs/persistence#The-store-prop
				snapshot = {props.pageData.tldraw}	// NOTE: Check what's causing this snapshot error??
				onMount = {handleMount}
				// persistenceKey = {props.filepath}
				// assetUrls = {assetUrls}
				shapeUtils = {MyCustomShapes}
				overrides = {myOverrides}
				hideUi // REVIEW: Does this do anything?
				// assetUrls = {assetUrls} // This causes multiple mounts
			/>
			<PrimaryMenuBar>
				<WritingMenu
					canUndo = {canUndo}
					canRedo = {canRedo}
					curTool = {curTool}
					onUndoClick = {undo}
					onRedoClick = {redo}
					onSelectClick = {activateSelectTool}
					onDrawClick = {activateDrawTool}
					onEraseClick = {activateEraseTool}
				/>
				{props.embedded && (
					<ExtendedWritingMenu
						onLockClick = { async () => {
							// TODO: Save immediately incase it hasn't been saved yet
							if(props.switchToReadOnly) props.switchToReadOnly();
						}}
					/>
				)}
			</PrimaryMenuBar>
		</div>
	</>;

};

///////////
///////////

async function getWritingSvg(editor: Editor) {
	let svgEl;

	silentlyChangeStore( editor, () => {
		// Hide page background element
		editor.updateShape({
			id: 'shape:primary_container' as TLShapeId,
			type: 'handwriting-container',
			isLocked: false,
			opacity: 0,
		}, {
			ephemeral: true,
		});
	});

	// get SVG
	const allShapeIds = Array.from(editor.getCurrentPageShapeIds().values());
	svgEl = await editor.getSvg(allShapeIds);

	silentlyChangeStore( editor, () => {
		// bring back page background element
		editor.updateShape({
			id: 'shape:primary_container' as TLShapeId,
			isLocked: true,
			type: 'handwriting-container',
			opacity: 1,
		}, {
			ephemeral: true,
		});

	})

	return svgEl;
}

// TODO: This could recieve the handwritingContainer id and only check the obejcts that sit within it.
// Then again, I should parent them to it anyway, in which case it could just check it's descendants.
function getWritingBounds(editor: Editor): Box {
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

function getDrawShapeBounds(editor: Editor): Box {

	const allShapes = editor.getCurrentPageShapes();
	let bounds = new Box(0, 0);
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

function simplifyLines(editor: Editor, entry: HistoryEntry<TLRecord>) {
	const updatedRecords = Object.values(entry.changes.updated);

	editor.batch(() => {

		updatedRecords.forEach( (record) => {
			const toRecord = record[1];
			if (toRecord.typeName == 'shape' && toRecord.type == 'draw') {
				// console.log('simplifying: ', toRecord.id)
				editor.updateShape({
					id: toRecord.id,
					type: 'draw',
					props: {
						...toRecord.props,
						dash: 'solid'
					},
				}, {
					ephemeral: true
				})
			}
		})

	})

}
