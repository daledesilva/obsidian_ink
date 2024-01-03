import { Editor, HistoryEntry, StoreSnapshot, TLRecord, TLShape, TLShapeId, setUserPreferences } from "@tldraw/tldraw";
import { WRITE_STROKE_LIMIT } from "src/constants";


//////////
//////////


export enum Activity {
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


export function getActivityType(entry: HistoryEntry<TLRecord>): Activity {
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


export function getActivitySummary(entry: HistoryEntry<TLRecord>) {
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




export function preventTldrawCanvasesCausingObsidianGestures() {
    const tlCanvas = document.getElementsByClassName('tl-canvas')[0] as HTMLDivElement;
    tlCanvas.addEventListener('touchmove', (e: Event) => {
        e.stopPropagation();
    })

    // NOTE: This might be a more appropriate method than above, but I don't know how to get a reference to the event object to stop propogation
    // editor.addListener('event', (e: TLEventInfo) => {
    // 	// if(e instanceof TLPointerEventInfo)
    // 	const str = `type: ${e.type}, name: ${e.name}, isPen: ${e?.isPen}`;
    // 	console.log(e);
    // 	setOutputLog(str);
    // });
}


export function initWritingCamera(editor: Editor, topMarginPx: number = 0) {
    let canvasWidth = editor.getContainer().innerWidth
    let containerMargin = 0;
    let containerWidth = 2000;
    let visibleWidth = containerWidth + 2 * containerMargin;
    const zoom = canvasWidth / visibleWidth;

    // REVIEW: These are currently hard coded to a specific page position
    let x = containerMargin;
    let y = topMarginPx;//containerMargin * 2;  // Pushes canvas down an arbitrary amount to prevent the "exit pen mode" button getting in the way

    // editor.zoomToFit()
    editor.setCamera({
        x: x,
        y: y,
        z: zoom
    })
}


export function initDrawingCamera(editor: Editor) {
    editor.zoomToFit()
}

export function adaptTldrawToObsidianThemeMode() {
    const isDarkMode = document.body.classList.contains('theme-dark');
    if (isDarkMode) {
        setUserPreferences({
            id: 'dummy-id',
            isDarkMode: true
        })
    } else {
        setUserPreferences({
            id: 'dummy-id',
            isDarkMode: false
        })
    }
}


export function removeExtensionAndDotFromFilepath(filepath: string) {
    const dotIndex = filepath.lastIndexOf(".");

    const aDotExists = dotIndex !== -1;
    const lastDotNotInPath = filepath.lastIndexOf("/") < dotIndex;
    if (aDotExists && lastDotNotInPath) {
        return filepath.substring(0, dotIndex);
    } else {
        return filepath;
    }
}


export function isEmptyWritingFile(tldrawData: StoreSnapshot<TLRecord>): boolean {
    let isEmpty = true;
    for (const record of Object.values(tldrawData.store)) {
        // Store should only contain document, page, and handwriting container shape
        if(record.typeName === 'shape') {
            const shapeRecord = record as TLShape;
            if (shapeRecord.type !== 'handwriting-container') {
                isEmpty = false;
            }
        } 
    }
    return isEmpty;
}

export function isEmptyDrawingFile(tldrawData: StoreSnapshot<TLRecord>): boolean {
    console.log('Drawing store', Object.keys(tldrawData.store))
    let isEmpty = true;
    for (const record of Object.values(tldrawData.store)) {
        // Store should only contain document and page
        if(record.typeName === 'shape') {
            isEmpty = false;
        } 
    }
    return isEmpty;
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



const stash: TLShape[] = [];
export const stashStaleStrokes = (editor: Editor) => {
	const completeShapes = getCompleteShapes(editor);

	let staleShapeIds: TLShapeId[] = [];
	let staleShapes: TLShape[] = [];
	// TODO: Order isn't guaranteed. Need to order by vertical position first
	for (let i = 0; i <= completeShapes.length - WRITE_STROKE_LIMIT; i++) {
		const record = completeShapes[i];
		if (record.type != 'draw') return;

		staleShapeIds.push(record.id as TLShapeId);
		staleShapes.push(record as TLShape);
	}
	
	stash.push(...staleShapes);
	silentlyChangeStore(editor, () => {
		editor.store.remove(staleShapeIds)
	})
}

export function unstashStaleStrokes(editor: Editor): void {
	silentlyChangeStore(editor, () => {
		editor.store.put(stash);
	})
	stash.length = 0;
}


export const silentlyChangeStore = (editor: Editor, func: () => void) => {
	editor.store.mergeRemoteChanges(func)
}
export const silentlyChangeStoreAsync = async (editor: Editor, func: () => void) => {
	editor.store.mergeRemoteChanges(func)
}

export const takeActionOnFullStore = (editor: Editor, func: () => void) => {
    unstashStaleStrokes(editor);
	silentlyChangeStore(editor, func)
    stashStaleStrokes(editor)
}
export const takeActionOnFullStoreAsync = async (editor: Editor, func: () => void) => {
	unstashStaleStrokes(editor);
	await silentlyChangeStoreAsync(editor, func);
    stashStaleStrokes(editor);
}