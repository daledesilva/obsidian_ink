import { Editor, HistoryEntry, StoreSnapshot, TLStoreSnapshot, TLRecord, TLShape, TLShapeId, TLUnknownShape, setUserPreferences, TLSerializedStore } from "@tldraw/tldraw";
import { WRITE_STROKE_LIMIT } from "src/constants";
import { useRef } from 'react';
import InkPlugin from "src/main";
import { WritingContainer } from "src/tldraw/writing-shapes/writing-container";
import { WritingLines } from "src/tldraw/writing-shapes/writing-lines";
import { showStrokeLimitTips_maybe } from "src/notices/stroke-limit-notice";
import { Notice } from "obsidian";

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
	if (!tlCanvas) return;

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
	if (!allShapesBounds) return;

	const targetZoom = 1;
	editor.zoomToBounds(allShapesBounds, { targetZoom });
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

export function initWritingCameraLimits(editor: Editor): WritingCameraLimits {
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
	if (!bounds) return;

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
			colorScheme: "dark",
		})
	} else {
		setUserPreferences({
			id: 'dummy-id',
			colorScheme: "light"
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

export function isEmptyWritingFile(tlStoreSnapshot: TLStoreSnapshot): boolean {
	let isEmpty = true;
	for (const record of Object.values(tlStoreSnapshot)) {
		// Store should only contain document, page, and handwriting container shape
		if (record.typeName === 'shape') {
			const shapeRecord = record as TLShape;
			if (shapeRecord.type !== 'writing-container') {
				isEmpty = false;
			}
		}
	}
	return isEmpty;
}

export function isEmptyDrawingFile(tlStoreSnapshot: TLStoreSnapshot): boolean {
	let isEmpty = true;
	for (const record of Object.values(tlStoreSnapshot)) {
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

		try {
			// REVIEW: This often throws an error on ipad. I'm not sure why.
			if(staleShapeIds.length >= 5) showStrokeLimitTips_maybe(plugin);
		} catch(error) {
			console.log('stashStaleContent when calling showStrokeLimitTips_maybe', error);
		}

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
	const writingContainerShape = editor.getShape('shape:writing-container' as TLShapeId) as WritingContainer;
	if (!writingContainerShape) return;
	const savedH = writingContainerShape.props.h;

	silentlyChangeStore(editor, () => {
		unlockShape(editor, writingContainerShape);
		editor.updateShape({
			id: writingContainerShape.id,
			type: writingContainerShape.type,
			// isLocked: true,
			props: {
				h: 0,
			},
			meta: {
				savedH: savedH,
			},
		});
		lockShape(editor, writingContainerShape);
	});
}

export const hideWritingLines = (editor: Editor) => {
	const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId) as WritingLines;
	if (!writingLinesShape) return;
	const savedH = writingLinesShape.props.h;

	editor.store.update(writingLinesShape.id, (record: WritingContainer) => {
		record.isLocked = false;
		return record;
	})

	silentlyChangeStore(editor, () => {
		unlockShape(editor, writingLinesShape);
		editor.updateShape({
			id: writingLinesShape.id,
			type: writingLinesShape.type,
			// isLocked: true,
			props: {
				h: 0,
			},
			meta: {
				savedH: savedH,
			}
		});
		lockShape(editor, writingLinesShape);
	});
}

export const unhideWritingContainer = (editor: Editor) => {
	const writingContainerShape = editor.getShape('shape:writing-container' as TLShapeId) as WritingContainer;
	if (!writingContainerShape) return;
	const h = writingContainerShape.meta.savedH;

	silentlyChangeStore(editor, () => {
		unlockShape(editor, writingContainerShape);
		editor.updateShape({
			id: writingContainerShape.id,
			type: writingContainerShape.type,
			// isLocked: true,
			props: {
				h: h,
			},
			meta: {
				savedH: undefined,
			}
		});
		lockShape(editor, writingContainerShape);
	});
}

export const unhideWritingLines = (editor: Editor) => {
	const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId) as WritingLines;
	if (!writingLinesShape) return;
	const h = writingLinesShape.meta.savedH;

	silentlyChangeStore(editor, () => {
		unlockShape(editor, writingLinesShape);
		editor.updateShape({
			id: writingLinesShape.id,
			type: writingLinesShape.type,
			// isLocked: true,
			props: {
				h: h,
			},
			meta: {
				savedH: undefined,
			}
		});
		lockShape(editor, writingLinesShape);
	});
}

// export const makeWritingTemplateInvisible = (editor: Editor) => {
// 	silentlyChangeStore( editor, () => {
// 		editor.updateShape({
// 			id: 'shape:writing-container' as TLShapeId,
// 			type: 'writing-container',
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
// 			id: 'shape:writing-container' as TLShapeId,
// 			isLocked: true,
// 			type: 'writing-container',
// 			opacity: 1,
// 		}, {
// 			ephemeral: true,
// 		});

// 	})
// }


export const silentlyChangeStore = (editor: Editor, func: () => void) => {
	editor.run( () => {
		editor.store.mergeRemoteChanges(func);
	}, {
		history: 'ignore',
	})
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


export function prepareWritingSnapshot(tlStoreSnapshot: TLStoreSnapshot): TLStoreSnapshot {
	return deleteObsoleteTemplateShapes(tlStoreSnapshot);
}

export function prepareDrawingSnapshot(tlStoreSnapshot: TLStoreSnapshot): TLStoreSnapshot {
	return tlStoreSnapshot;
}


/***
 * Deletes obsolete template shapes but doesn't add updated ones.
 * See updateWritingStoreIfNeeded.
 * // TODO: This desperately needs unit testing as it can delete elements from the users file
 */
export function deleteObsoleteTemplateShapes(tlStoreSnapshot: TLStoreSnapshot): TLStoreSnapshot {
	const updatedSnapshot = JSON.parse(JSON.stringify(tlStoreSnapshot));
	
	let obsoleteShapeIds: TLShapeId[] = [
		'shape:primary_container' as TLShapeId,	// From before version 0.1.192
		'shape:handwriting_lines' as TLShapeId,	// From while testing
	];

	const filteredStore = Object.entries(tlStoreSnapshot.store).filter(
		([key, tlRecord]) => {
			const isObsoleteObj = obsoleteShapeIds.some((obsId) => tlRecord.id === obsId);
			if (isObsoleteObj) {
				console.log('Removing old ink element to update file:', tlRecord)
				return false;
			}
			return true
		}
	);
	updatedSnapshot.store = Object.fromEntries(filteredStore);

	return updatedSnapshot;
}


export const updateWritingStoreIfNeeded = (editor: Editor) => {
	addNewTemplateShapes(editor);
}

function addNewTemplateShapes(editor: Editor) {
	const hasLines = editor.store.has('shape:writing-lines' as TLShapeId);
	if(!hasLines) {
		editor.createShape({
			id: 'shape:writing-lines' as TLShapeId,
			type: 'writing-lines',
		})
	}

	const hasContainer = editor.store.has('shape:writing-container' as TLShapeId);
	if(!hasContainer) {
			editor.createShape({
			id: 'shape:writing-container' as TLShapeId,
			type: 'writing-container',
		})
	}
}

export function unlockShape(editor: Editor, shape: TLUnknownShape) {

	// NOTE: Unlocking through updateShape causes an object.hasOwn error on older Android devices
	// editor.updateShape({
	// 	id: shape.id,
	// 	type: shape.type,
	//  isLocked: false,
	// }, {
	// 	ephemeral: true
	// })

	// NOTE: Unlocking directly in the store instead.
	editor.store.update(shape.id, (record: TLUnknownShape) => {
		const newRecord = JSON.parse(JSON.stringify(record));
		newRecord.isLocked = false;
		return newRecord;
	})

}

export function lockShape(editor: Editor, shape: TLUnknownShape) {

	// NOTE: Locking through updateShape causes an object.hasOwn error on older Android devices
	// editor.updateShape({
	// 	id: shape.id,
	// 	type: shape.type,
	//  isLocked: true,
	// }, {
	// 	ephemeral: true
	// })

	// NOTE: Locking directly in the store instead.
	editor.store.update(shape.id, (record: TLUnknownShape) => {
		const newRecord = JSON.parse(JSON.stringify(record));
		newRecord.isLocked = true;
		return newRecord;
	})

}


