import { Editor, HistoryEntry, RecordType, SerializedStore, StoreSnapshot, TLEventInfo, TLPage, TLPageId, TLRecord, TLShape, TLUiEventHandler, TLUiOverrides, Tldraw, UiEvent, toolbarItem, useEditor } from "@tldraw/tldraw";
import * as React from "react";
import { useCallback, useRef, PointerEventHandler, useEffect } from "react";
import { initCamera, preventTldrawCanvasesCausingObsidianGestures } from "src/utils/helpers";
import HandwritingContainer from "./shapes/handwriting-container"
import { debounce } from "obsidian";

///////
///////

const MyCustomShapes = [HandwritingContainer];

let hiddenShapes: TLShape[] = [];

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


export function TldrawHandwrittenEditor (props: {
	existingData: SerializedStore<TLRecord>,
	uid: string,
	save: Function,
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const containerRef = useRef<HTMLDivElement>(null)
	const [outputLog, setOutputLog] = React.useState('This is the output log');
	const postProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const justProcessedRef = useRef<boolean>(false);


	const handleMount = (editor: Editor) => {

		unstashOldShapes(editor);

		initCamera(editor);
		editor.updateInstanceState({
			isDebugMode: false,
		})

		editor.store.listen((entry) => {

			// Bail if this listener fired because again of changes made in the listener itself
			if(justProcessedRef.current) {
				console.log('just processed');
				justProcessedRef.current = false;
				return;
			}

			const activity = getActivityType(entry);
			switch(activity) {
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
					clearTimeout(postProcessTimeoutRef.current);
					// stashOldShapes(editor); // NOTE: Can't do this while user is drawing because it changes pages and back, which messes with the stroke.
					break;

				case Activity.DrawingContinued:
					clearTimeout(postProcessTimeoutRef.current);
					break;

				case Activity.DrawingCompleted:
					saveContent(editor); // REVIEW: Temporarily saving immediately as well just incase the user closes the file too quickly (But this might cause a latency issue)
					writingPostProcesses(entry, editor);
					break;

				case Activity.DrawingErased:
					saveContent(editor);
					break;

				default:
					// console.log('Activity not recognised.');
					// console.log('entry', JSON.parse(JSON.stringify(entry)) );
			}
			
		}, {
			source: 'user',	// Local changes
			scope: 'all'	// Filters some things like camera movement changes. But Not sure it's locked down enough, so leaving as all.
		})

		preventTldrawCanvasesCausingObsidianGestures();
		editor.setCurrentTool('draw');

		return () => {
			// NOTE: This prevents the postProcessTimer completing when a new file is open and saving over that file.
			clearTimeout(postProcessTimeoutRef.current);
		};
	}


	


	// Use this to run optimisations after a short delay
	const writingPostProcesses = (entry: HistoryEntry<TLRecord>, editor: Editor) => {
		clearTimeout(postProcessTimeoutRef.current);
		
		postProcessTimeoutRef.current = setTimeout( () => {
			console.log('Running writingPostProcesses');
	
			// Bring all writing back to main canvas
			unstashOldShapes(editor);

			// Save content
			saveContent(editor);			

			// Take screenshot for embed preview & OCR
	
			// Optimise writing by moving old writing off canvas
			stashOldShapes(editor);

			justProcessedRef.current = true;
		}, 2000)
		
	};


	const saveContent = (editor: Editor) => {
		const tldrawData = editor.store.getSnapshot();
		props.save(tldrawData);
	}




	return <>
		<div
			ref = {containerRef}
			style = {{
				height: '100%',
			}}
		>
			<Tldraw
				// TODO: Try converting snapshot into store: https://tldraw.dev/docs/persistence#The-store-prop
				snapshot = {props.existingData}	// NOTE: Check what's causing this snapshot error??
				// persistenceKey = {props.uid}
				onMount = {handleMount}
				// assetUrls = {assetUrls}
				shapeUtils = {MyCustomShapes}
				overrides = {myOverrides}
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

export default TldrawHandwrittenEditor;









const stashOldShapes = (editor: Editor) => {
	// editor.batch( () => {
		
	const completeShapes = getCompleteShapes(editor);
	const stashPage = getOrCreateStash(editor);
	
	let olderShapes: TLShape[] = [];
	let recentCount = 300;	// The number of recent strokes to keep visible

	// TODO: Order isn't guaranteed. Need to order by vertical position first
	for(let i=0; i<=completeShapes.length-recentCount; i++) {
		const record = completeShapes[i];
		if(record.type != 'draw') return;

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
	
	if(activitySummary.drawShapesCompleted) return Activity.DrawingCompleted;	// Note, this overules everything else
	if(activitySummary.drawShapesStarted) return Activity.DrawingStarted;
	if(activitySummary.drawShapesContinued) return Activity.DrawingContinued;
	if(activitySummary.drawShapesRemoved) return Activity.DrawingErased;

	if(activitySummary.cameraMoved && activitySummary.pointerMoved) return Activity.CameraMovedManually;
	if(activitySummary.cameraMoved && !activitySummary.pointerMoved) return Activity.CameraMovedAutomatically;
	
	if(activitySummary.pointerScribbled) return Activity.ErasingContinued;
	if(activitySummary.pointerMoved) return Activity.PointerMoved;

	return Activity.Unclassified;
}

function getOrCreateStash(editor: Editor): TLPage {
	let page = editor.getPage('page:stash' as TLPageId);
	if(!page) {
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
	if(!stashPage) return;

	let allStashShapes: TLShape[] | undefined;
	editor.batch( () => {
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
	if(addedRecords) {
		for(let i=0; i<addedRecords.length; i++) {
			const record = addedRecords[i];
			if(record.typeName == 'shape' && record.type == 'draw') {
				summary.drawShapesStarted += 1;
				if(record.props.isComplete === true) {
					summary.drawShapesCompleted += 1;
				};
			}
		}
	}

	const updatedRecords = Object.values(entry.changes.updated);
	if(updatedRecords) {
		for(let i=0; i<updatedRecords.length; i++) {
			const recordFinalState = updatedRecords[i][1];
			if(recordFinalState.typeName == 'shape' && recordFinalState.type == 'draw') {
				if(recordFinalState.props.isComplete === true) {
					summary.drawShapesCompleted += 1;
				} else {
					summary.drawShapesContinued += 1;
				}
			} else if(recordFinalState.typeName == 'pointer') {
				summary.pointerMoved = true;
			} else if(recordFinalState.typeName == 'camera') {
				summary.cameraMoved = true;
			} else if(recordFinalState.typeName == 'instance') {
				if(recordFinalState.scribble) summary.pointerScribbled = true;
			}
		}
	}

	const removedRecords = Object.values(entry.changes.removed);
	if(removedRecords) {
		for(let i=0; i<removedRecords.length; i++) {
			const record = removedRecords[i];
			if(record.typeName == 'shape' && record.type == 'draw') {
				summary.drawShapesRemoved += 1;
			}
		}
	}

	return summary;
}




function getCompleteShapes(editor: Editor) {
	const allShapes = editor.currentPageShapes;
	let completeShapes: TLShape[] = [];
	for(let i=0; i<allShapes.length; i++) {
		const shape = allShapes[i];
		if(shape.props.isComplete === true) completeShapes.push(shape);
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
	for(let i=0; i<allShapes.length; i++) {
		const shape = allShapes[i];
		if(shape.props.isComplete === false) incompleteShapes.push(shape);
	}
	return incompleteShapes;
}
