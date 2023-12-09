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


export function TldrawViewEditor (props: {
	existingData: SerializedStore<TLRecord>,
	uid: string,
	save: Function,
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const containerRef = useRef<HTMLDivElement>(null)
	const [outputLog, setOutputLog] = React.useState('This is the output log');


	const handleMount = (editor: Editor) => {

		// const allRecords = editor.store.allRecords();
		// const containers = allRecords.filter( (record: any) => {
		// 	return record?.type === 'handwriting-container'
		// })
		// if(!containers.length) {
		// 	editor.createShapes([{ type: 'handwriting-container' }]);
		// }
		unstashAllShapes(editor);

		initCamera(editor);
		editor.updateInstanceState({
			isDebugMode: false,
		})

		editor.store.listen((entry) => {
			const activity = getActivityType(entry);
			let contents: StoreSnapshot<TLRecord>;

			switch(activity) {
				case Activity.PointerMove:
					console.log('Pointer Move');
					return;
				case Activity.AutoCameraMove:
				case Activity.ManualCameraMove:
					console.log('Camera Move');
					// Clear timeout
					// Bring back shapes
					break;
				case Activity.DrawingStarted:
					console.log('Drawing Started');
					// clear timeout
					// Hide shapes
					break;
				case Activity.DrawingProgressing:
					console.log('Drawing Progressing');
					// clear timeout
					return;
				case Activity.DrawingComplete:
					console.log('Drawing Complete');
					contents = editor.store.getSnapshot();
					props.save(contents);
					writingPostProcesses(entry, editor);
					break;
				case Activity.DrawingRemoved:
					console.log('Drawing Removed');
					contents = editor.store.getSnapshot();
					props.save(contents);
					writingPostProcesses(entry, editor);
					break;
				default:
					console.log('Activity not recognised.');
					console.log('activity', activity);
					console.log('entry', JSON.parse(JSON.stringify(entry)) );
			}
			
		})

		preventTldrawCanvasesCausingObsidianGestures();
		editor.setCurrentTool('draw')
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

export default TldrawViewEditor;





// Use this to run optimisations after a short delay
const writingPostProcesses = debounce( (entry: HistoryEntry<TLRecord>, editor: Editor) => {
	console.log('Running writingPostProcesses');


	// Bring all writing back to main canvas

	// Save content

	// Take screenshot for embed preview & OCR

	// Optimise writing by moving old writing off canvas
	///////////
	// editor.batch( () => {
		
		const completeShapes = getCompleteShapes(editor);
		const stashPage = getOrCreateStash(editor);
		
		let olderShapes: TLShape[] = [];
		let recentCount = 300;	// The number of recent strokes to keep visible

		for(let i=0; i<=completeShapes.length-recentCount; i++) {
			const record = completeShapes[i];
			if(record.type != 'draw') return;

			olderShapes.push(record as TLShape);
		}

		editor.moveShapesToPage(olderShapes, stashPage.id);
		editor.setCurrentPage(editor.pages[0]);

	// })
	
}, 2000, true)



// Use this to run optimisations after a short delay
const unstashAllShapes = (editor: Editor) => {
	// console.log('hiddenShapes', hiddenShapes);
	// editor.createShapes( hiddenShapes.splice(0));

	// const allShapes = editor.currentPageShapes;
	// allShapes.forEach( (record: TLShape) => {
	// 	if(record.type != 'draw') return;
	// 	editor.updateShape({
	// 		id: record.id,
	// 		type: record.type,
	// 		opacity: 1,
	// 		isLocked: false,
	// 	})
	// })

	const stashShapes = getStashShapes(editor);
	// if(!stashShapes) return;

	
}



enum Activity {
	PointerMove,
	ManualCameraMove,
	AutoCameraMove,
	DrawingStarted,
	DrawingProgressing,
	DrawingComplete,
	DrawingRemoved,
	Unclassified,
}


function getActivityType(entry: HistoryEntry<TLRecord>): Activity {

	if( isOnlyMouseMove(entry) ) {
		return Activity.PointerMove;
	}

	// Check if camera and pointer move
	if( isCameraMove(entry) ) {
		return Activity.ManualCameraMove;
	};
	
	// If only camera move
	// if( ) {
	// 	return Activity.AutoCameraMove;
	// };

	const getUpdatedSummary(entry);


	// If any drawing was completed, report complete, even if started at the same time
	if( Object.keys(entry.changes.updated).length ) {
		// TODO: Check if everything is marked as isComplete
		return Activity.DrawingComplete;
	}

	// If anything was added but not yet completed, report added
	if( Object.keys(entry.changes.added).length ) {
		console.log('entry.changes.added', entry.changes.added);
		// TODO: Should check that it's not complete - if it is, report complete instead
		return Activity.DrawingStarted;
	}

	// If anything's been updated and not yet completed
	// if( containsIncompleteDrawShapes(entry) ) {
	// Pointer will be in updated list, so more than 2 items means updated shape records
	if( Object.keys(entry.changes.updated).length > 1 ) {
		return Activity.DrawingProgressing;
	}

	// If anything was removed (Assumed to never overlap with the othersobs)
	if( Object.keys(entry.changes.removed).length ) {
		console.log('entry.changes.removed', entry.changes.removed);
		// TODO: Should check if this is a draw shape
		return Activity.DrawingRemoved;
	}

	return Activity.Unclassified;
}

function getOrCreateStash(editor: Editor): TLPage {
	let page = editor.getPage('page:stash' as TLPageId);
	if(!page) {
		let testPage = editor.createPage({id: 'page:stash' as TLPageId});
		page = editor.getPage('page:stash' as TLPageId)!;
	}
	return page;
}

function getStashShapes(editor: Editor): TLShape[] | undefined {
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




function containsIncompleteDrawShapes(entry: HistoryEntry<TLRecord>): boolean {
	const addedRecords = Object.values(entry.changes.added);
	const updatedRecords = Object.values(entry.changes.updated);
	// const removedRecords = Object.values(entry.changes.removed);
	if(arrayContainsIncompleteDrawShape(addedRecords)) return true;
	if(tupleArrayContainsIncompleteDrawShape(updatedRecords)) return true;
	// if(arrayContainsIncompleteDrawShape(removedRecords)) return true;
	return false;
}

function arrayContainsIncompleteDrawShape(records: TLRecord[]) : boolean {
	if(!records) return false;
	for(let i=0; i<records.length; i++) {
		const record = records[i];
		if(record.typeName == 'shape' && record.type == 'draw') {
			if(record.props.isComplete === false) return true;
		}
	}
	return false;
}

function tupleArrayContainsIncompleteDrawShape(records: [from: TLRecord, to: TLRecord][]) : boolean {
	if(!records) return false;
	for(let i=0; i<records.length; i++) {
		const recordFinalState = records[i][1];
		if(recordFinalState.typeName == 'shape' && recordFinalState.type == 'draw') {
			if(recordFinalState.props.isComplete === false) return true;
		}
	}
	return false;
}

function tupleContainsNonMouseRecords(records: [from: TLRecord, to: TLRecord][]) : boolean {
	if(!records) return false;
	for(let i=0; i<records.length; i++) {
		const recordFinalState = records[i][1];
		if(recordFinalState.typeName != 'pointer') {
			return true;
		}
	}
	return false;
}

function tupleContainsNonCameraRecords(records: [from: TLRecord, to: TLRecord][]) : boolean {
	if(!records) return false;
	let hasCamera = false;

	for(let i=0; i<records.length; i++) {
		const recordFinalState = records[i][1];
		if(recordFinalState.typeName != 'camera' && recordFinalState.typeName != 'pointer') {
			return true;	// It's a non camera move record
		}
		if(recordFinalState.typeName === 'camera') {
			hasCamera = true;
		}
	}
	if(hasCamera) {
		// It's a camera move and nothing else
		return false;
	} else {
		// It's just a pointer move
		return true;
	}
}



function getActivitySummary(entry: HistoryEntry<TLRecord>) {
	const summary = {
		pointerMoved: false,
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

function isCameraMove(entry: HistoryEntry<TLRecord>): boolean {
	const addedRecords = Object.values(entry.changes.added);
	const updatedRecords = Object.values(entry.changes.updated);
	const removedRecords = Object.values(entry.changes.removed);
	if(addedRecords.length) return false;
	if(removedRecords.length) return false;
	if(tupleContainsNonCameraRecords(updatedRecords)) return false;
	return true;
}

function isOnlyMouseMove(entry: HistoryEntry<TLRecord>): boolean {
	const addedRecords = Object.values(entry.changes.added);
	const updatedRecords = Object.values(entry.changes.updated);
	const removedRecords = Object.values(entry.changes.removed);
	if(addedRecords.length) return false;
	if(removedRecords.length) return false;
	if(tupleContainsNonMouseRecords(updatedRecords)) return false;
	return true;
}

