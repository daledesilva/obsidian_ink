import { Editor, HistoryEntry, StoreSnapshot, TLRecord, TLShape, TLShapeId, setUserPreferences } from "@tldraw/tldraw";
import { WRITE_STROKE_LIMIT } from "src/constants";
import { useRef } from 'react';
import InkPlugin from "src/main";

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

	// if (activitySummary.pointerScribbled) return Activity.ErasingContinued;	// This isn't correct. Could be arrow drag, erase drag, or even occasionall reported from pen drag.
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
				if (recordFinalState.scribbles) summary.pointerScribbled = true;
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

export function preventTldrawCanvasesCausingObsidianGestures(tlEditor: Editor) {
	const tlContainer = tlEditor.getContainer();

	const tlCanvas = tlContainer.getElementsByClassName('tl-canvas')[0] as HTMLDivElement;
	if(!tlCanvas) return;
	
	// Prevent fingers and capacitive pens causing Obsidian gestures
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

	silentlyChangeStore(editor, () => {
		editor.setCamera({
			x: x,
			y: y,
			z: zoom
		})
	})
}

export function initDrawingCamera(editor: Editor) {
	const allShapesBounds = editor.getCurrentPageBounds();
	if(!allShapesBounds) return;

	const targetZoom = 1;
	editor.zoomToBounds(allShapesBounds, {targetZoom});
}

export interface WritingCameraLimits {
	x: {
		min: number,
		max: number,
	},
	zoom: {
		min: number,
		max: number,
	},
}

export function initWritingCameraLimits(editor: Editor) : WritingCameraLimits {
	return {
		x: {
			min: editor.getCamera().x,
			max: editor.getCamera().x
		},
		zoom: {
			min: editor.getCamera().z,
			max: editor.getCamera().z
		},
	}
}

export function restrictWritingCamera(editor: Editor, cameraLimits: WritingCameraLimits) {

	const bounds = editor.getCurrentPageBounds();
	if(!bounds) return;

	const yMin = bounds.minY - 500;
	const yMax = bounds.maxY + 1000;

	let x = editor.getCamera().x;
	let y = editor.getCamera().y;
	let zoom = editor.getZoomLevel();

	x = Math.max(x, cameraLimits.x.min);
	x = Math.min(x, cameraLimits.x.max);
	y = Math.max(y, yMin);
	y = Math.min(y, yMax);
	zoom = Math.max(zoom, cameraLimits.zoom.min);
	zoom = Math.min(zoom, cameraLimits.zoom.max);

	silentlyChangeStore(editor, () => {
		editor.setCamera({
			x: x,
			y: y,
			z: zoom
		})
	})
}

export function adaptTldrawToObsidianThemeMode(editor: Editor) {
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
		if (record.typeName === 'shape') {
			const shapeRecord = record as TLShape;
			if (shapeRecord.type !== 'handwriting-container') {
				isEmpty = false;
			}
		}
	}
	return isEmpty;
}

export function isEmptyDrawingFile(tldrawData: StoreSnapshot<TLRecord>): boolean {
	let isEmpty = true;
	for (const record of Object.values(tldrawData.store)) {
		// Store should only contain document and page
		if (record.typeName === 'shape') {
			isEmpty = false;
		}
	}
	return isEmpty;
}

function getCompleteShapes(editor: Editor) {
	const allShapes = editor.getCurrentPageShapes();
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
	const allShapes = editor.getCurrentPageShapes();
	let incompleteShapes: TLShape[] = [];
	for (let i = 0; i < allShapes.length; i++) {
		const shape = allShapes[i];
		if (shape.props.isComplete === false) incompleteShapes.push(shape);
	}
	return incompleteShapes;
}

export const useStash = (plugin: InkPlugin) => {
	const stash = useRef<TLShape[]>([]);

	const stashStaleContent = (editor: Editor) => {
		const completeShapes = getCompleteShapes(editor);

		const staleShapeIds: TLShapeId[] = [];
		const staleShapes: TLShape[] = [];

		// TODO: Order shapes by vertical position
		for (let i = 0; i <= completeShapes.length - plugin.settings.writingStrokeLimit; i++) {
			const record = completeShapes[i];
			if (record.type !== 'draw') return;

			staleShapeIds.push(record.id as TLShapeId);
			staleShapes.push(record as TLShape);
		}

		stash.current.push(...staleShapes);
		silentlyChangeStore(editor, () => {
			editor.store.remove(staleShapeIds);
		});
	};

	const unstashStaleContent = (editor: Editor) => {
		silentlyChangeStore(editor, () => {
			editor.store.put(stash.current);
		});
		stash.current.length = 0;
	};

	return { stashStaleContent, unstashStaleContent };
};

export const hideWritingTemplate = (editor: Editor) => {
	hideWritingContainer(editor);
	hideWritingLines(editor);
}

export const unhideWritingTemplate = (editor: Editor) => {
	unhideWritingContainer(editor);
	unhideWritingLines(editor);
}

export const hideWritingContainer = (editor: Editor) => {
	const templateShape = editor.getShape('shape:primary_container' as TLShapeId);
	if(!templateShape) return;
	const savedH = templateShape.props.h;

	silentlyChangeStore( editor, () => {
		editor.updateShape({
			id: 'shape:primary_container' as TLShapeId,
			type: 'handwriting-container',
			isLocked: false,
			props: {
				h: 0,
				savedH: savedH
			}
		}, {
			ephemeral: true,
		});
	});
}

export const hideWritingLines = (editor: Editor) => {
	const templateShape = editor.getShape('shape:handwriting_lines' as TLShapeId);
	if(!templateShape) return;
	const savedH = templateShape.props.h;

	silentlyChangeStore( editor, () => {
		editor.updateShape({
			id: 'shape:handwriting_lines' as TLShapeId,
			type: 'handwriting-lines',
			isLocked: false,
			props: {
				h: 0,
				savedH: savedH
			}
		}, {
			ephemeral: true,
		});
	});
}

export const unhideWritingContainer = (editor: Editor) => {
	const templateShape = editor.getShape('shape:primary_container' as TLShapeId);
	if(!templateShape) return;
	const h = templateShape.props.savedH;

	silentlyChangeStore( editor, () => {
		editor.updateShape({
			id: 'shape:primary_container' as TLShapeId,
			type: 'handwriting-container',
			isLocked: false,
			props: {
				h: h,
				savedH: undefined
			}
		}, {
			ephemeral: true,
		});
	});
}

export const unhideWritingLines = (editor: Editor) => {
	const templateShape = editor.getShape('shape:handwriting_lines' as TLShapeId);
	if(!templateShape) return;
	const h = templateShape.props.savedH;

	silentlyChangeStore( editor, () => {
		editor.updateShape({
			id: 'shape:handwriting_lines' as TLShapeId,
			type: 'handwriting-lines',
			isLocked: false,
			props: {
				h: h,
				savedH: undefined
			}
		}, {
			ephemeral: true,
		});
	});
}

// export const makeWritingTemplateInvisible = (editor: Editor) => {
// 	silentlyChangeStore( editor, () => {
// 		editor.updateShape({
// 			id: 'shape:primary_container' as TLShapeId,
// 			type: 'handwriting-container',
// 			isLocked: false,
// 			opacity: 0,
// 		}, {
// 			ephemeral: true,
// 		});
// 	});
// }


// export const makeWritingTemplateVisible = (editor: Editor) => {
// 	silentlyChangeStore( editor, () => {
// 		editor.updateShape({
// 			id: 'shape:primary_container' as TLShapeId,
// 			isLocked: true,
// 			type: 'handwriting-container',
// 			opacity: 1,
// 		}, {
// 			ephemeral: true,
// 		});

// 	})
// }


export const silentlyChangeStore = (editor: Editor, func: () => void) => {
	editor.store.mergeRemoteChanges(func);
}

// TODO: This doesn't work, don't use it, I think I need to add a promise to be returned, but just do it when needed
// export const silentlyChangeStoreAsync = async (editor: Editor, func: () => void) => {
// 	editor.store.mergeRemoteChanges(func);
// }

// These two are intended for replacing an unstash+commands+restash sequence, but the asyncs aren't quite working yet
// export const takeActionOnFullStore = (editor: Editor, func: () => void) => {
// 	unstashStaleStrokes(editor);
// 	silentlyChangeStore(editor, func)
// 	stashStaleStrokes(editor)
// }
// export const takeActionOnFullStoreAsync = async (editor: Editor, func: () => void) => {
// 	unstashStaleStrokes(editor);
// 	await silentlyChangeStoreAsync(editor, func);
//     stashStaleStrokes(editor);
// }