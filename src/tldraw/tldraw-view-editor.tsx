import { Editor, HistoryEntry, RecordType, SerializedStore, TLEventInfo, TLPage, TLPageId, TLRecord, TLShape, TLUiEventHandler, TLUiOverrides, Tldraw, UiEvent, toolbarItem, useEditor } from "@tldraw/tldraw";
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
			// Check if only containers mouse movement // clear timeout and return
			// Check if only camera movement // clear timeout and return
			// Actually, make the above containsNonContentUpdates(entry)  (ie. mouse, camera, or both only)
			if(containsIncompleteDrawShapes(entry)) return; // and clear timeout

			const contents = editor.store.getSnapshot();
			props.save(contents);
			writingPostProcess(entry, editor);
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
const writingPostProcess = debounce( (entry: HistoryEntry<TLRecord>, editor: Editor) => {
	console.log('Running writingPostProcess');
	
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



function getOrCreateStash(editor: Editor): TLPage {
	let page = editor.getPage('page:stash' as TLPageId);
	if(!page) {
		let testPage = editor.createPage({id: 'page:stash' as TLPageId});
		// console.log('testPage', testPage);
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
	const removedRecords = Object.values(entry.changes.removed);
	if(arrayContainsIncompleteDrawShape(addedRecords)) return false;
	if(tupleArrayContainsIncompleteDrawShape(updatedRecords)) return false;
	if(arrayContainsIncompleteDrawShape(removedRecords)) return false;
	return true;
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