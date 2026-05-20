import { Editor, HistoryEntry, TLStoreSnapshot, TLRecord, TLShape, TLShapeId, TLUnknownShape, setUserPreferences, Box, TLEditorSnapshot } from "@tldraw/tldraw";
import { WRITING_LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from "src/constants";
import { useRef } from 'react';
import InkPlugin from "src/main";
import { showStrokeLimitTips_maybe } from "src/components/dom-components/stroke-limit-notice";
import { info, verbose } from "../../../../logic/utils/universal-dev-logging";
import { WritingContainer } from "../writing/shapes/writing-container";
import { WritingLines } from "../writing/shapes/writing-lines";
import { getGlobals } from "src/stores/global-store";

function narrowStoreRecordToShape(record: unknown): TLUnknownShape {
	if (typeof record !== "object" || record === null) {
		throw new Error("Ink: store update expected a shape record");
	}
	return record as TLUnknownShape;
}

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
				if ('isComplete' in record.props && record.props.isComplete === true) {
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
				if ('isComplete' in recordFinalState.props && recordFinalState.props.isComplete === true) {
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
	let canvasWidth = editor.getContainer().clientWidth
	let containerMargin = 0;
	let containerWidth = 2000;
	let visibleWidth = containerWidth + 2 * containerMargin;
	const zoom = canvasWidth / visibleWidth;

	// REVIEW: These are currently hard coded to a specific page position
	let x = containerMargin;
	let y = topMarginPx;//containerMargin * 2;  // Pushes canvas down an arbitrary amount to prevent the "exit pen mode" button getting in the way

	// editor.run with history:'ignore' is required for camera updates — camera is an instance-scoped
	// record and mergeRemoteChanges (used by silentlyChangeStore) silently skips instance records.
	editor.run(() => {
		editor.setCamera({ x, y, z: zoom })
	}, { history: 'ignore' })
}

export function initDrawingCamera(editor: Editor) {
	const allShapesBounds = editor.getCurrentPageBounds();
	// editor.run with history:'ignore' is required for camera updates — camera is an instance-scoped
	// record and mergeRemoteChanges (used by silentlyChangeStore) silently skips instance records.
	if (!allShapesBounds) {
		// Adjust zoom to make line thickness similar to writing
		const cam = editor.getCamera();
		editor.run(() => { editor.setCamera({ ...cam, z: 0.3 }); }, { history: 'ignore' });
		return;
	};

	const vw = editor.getContainer().clientWidth;
	const vh = editor.getContainer().clientHeight;
	const INSET = 16;
	const zoom = Math.max(0.01, Math.min(
		allShapesBounds.w > 0 ? (vw - INSET * 2) / allShapesBounds.w : 1,
		allShapesBounds.h > 0 ? (vh - INSET * 2) / allShapesBounds.h : 1,
		1,
	));
	// In tldraw: screenPos = pagePos * zoom + cameraOffset
	// To centre bounds: cameraOffset = viewportCentre - boundsCentre * zoom
	const x = vw / 2 - allShapesBounds.midX * zoom;
	const y = vh / 2 - allShapesBounds.midY * zoom;
	editor.run(() => { editor.setCamera({ x, y, z: zoom }); }, { history: 'ignore' });
}

/**
 * Starts a RAF loop that watches the editor container's clientWidth each frame and calls
 * `onWidthChange` whenever it changes. Stops once the width has been stable for
 * 3 consecutive frames AND at least 30 total frames have elapsed (~500ms at 60fps),
 * ensuring the loop outlives any sidebar-collapse CSS animation.
 * Returns a cancel function — call it in cleanup/unmount.
 */
export function startCameraSettleRaf(
	editor: Editor,
	onWidthChange: () => void,
): () => void {
	const SETTLE_FRAMES_NEEDED = 3;
	const MIN_FRAMES_BEFORE_SETTLE = 30;
	let lastWidth = editor.getContainer().clientWidth;
	let stableFrames = 0;
	let totalFrames = 0;
	let rafHandle = 0;
	const checkAndReposition = () => {
		totalFrames++;
		const width = editor.getContainer().clientWidth;
		if (width !== lastWidth) {
			lastWidth = width;
			stableFrames = 0;
			onWidthChange();
		} else {
			stableFrames++;
		}
		if (stableFrames >= SETTLE_FRAMES_NEEDED && totalFrames >= MIN_FRAMES_BEFORE_SETTLE) return;
		rafHandle = window.requestAnimationFrame(checkAndReposition);
	};
	rafHandle = window.requestAnimationFrame(checkAndReposition);
	return () => cancelAnimationFrame(rafHandle);
}

/**
 * Starts a ResizeObserver on the editor container. On each width change it calls `onResize`
 * immediately, then runs a stability-based RAF loop that keeps calling `onResize` for as long
 * as the container width keeps changing (e.g. during a slow window drag or sidebar animation)
 * and stops only once the width has been stable for 3 consecutive frames.
 * Height-only changes (e.g. embed template resizing) are intentionally ignored.
 * Returns a cleanup function — call it in cleanup/unmount.
 */
export function startCameraResizeObserver(
	editor: Editor,
	onResize: () => void,
): () => void {
	const STABLE_FRAMES_NEEDED = 3;
	let rafHandle = 0;
	let lastWidth = 0;

	const runSettleRaf = () => {
		cancelAnimationFrame(rafHandle);
		let stableFrames = 0;
		const tick = () => {
			const width = editor.getContainer().clientWidth;
			if (width !== lastWidth) {
				lastWidth = width;
				stableFrames = 0;
				onResize();
			} else {
				stableFrames++;
			}
			if (stableFrames < STABLE_FRAMES_NEEDED) rafHandle = window.requestAnimationFrame(tick);
		};
		rafHandle = window.requestAnimationFrame(tick);
	};

	const observer = new ResizeObserver(() => {
		const width = editor.getContainer().clientWidth;
		// Only react to width changes — height changes (e.g. embed template resizing) should
		// not trigger a camera reset or restart the settle RAF.
		if (width === lastWidth) return;
		lastWidth = width;
		onResize();
		runSettleRaf();
	});
	observer.observe(editor.getContainer());
	return () => {
		observer.disconnect();
		cancelAnimationFrame(rafHandle);
	};
}

export interface WritingCameraLimits {
	x: {
		min: number,
		max: number,
	},
	y: {
		max: number,	// Initial camera y — prevents scrolling above the writing area
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
		y: {
			max: editor.getCamera().y,
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

	const viewportHeight = editor.getViewportScreenBounds().h;
	let x = editor.getCamera().x;
	let y = editor.getCamera().y;
	let zoom = editor.getZoomLevel();

	// Allow scrolling until the template bottom reaches the viewport bottom (lines cover the full scroll area)
	const yMin = viewportHeight - bounds.maxY * zoom;
	const yMax = cameraLimits.y.max;	// Cap at initial position — no scrolling above the writing area

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
	for (const record of Object.values(tlStoreSnapshot.store)) {
		// Store should only contain document, page, and handwriting container shape
		if (record.typeName === 'shape') {
			if (record.type !== 'writing-container') {
				isEmpty = false;
			}
		}
	}
	return isEmpty;
}

export function isEmptyDrawingFile(tlStoreSnapshot: TLStoreSnapshot): boolean {
	let isEmpty = true;
	for (const record of Object.values(tlStoreSnapshot.store)) {
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
		if ('isComplete' in shape.props && shape.props.isComplete === true) {
			completeShapes.push(shape);
		}
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
		if ('isComplete' in shape.props && shape.props.isComplete === false) {
			incompleteShapes.push(shape);
		}
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

			staleShapeIds.push(record.id);
			staleShapes.push(record);
		}

		stash.current.push(...staleShapes);
		silentlyChangeStore(editor, () => {
			editor.store.remove(staleShapeIds);
		});

		try {
			// REVIEW: This often throws an error on ipad. I'm not sure why.
			if(staleShapeIds.length >= 5) showStrokeLimitTips_maybe(plugin);
		} catch (caught: unknown) {
			verbose(['Error from stashing stale content (when calling showStrokeLimitTips_maybe)', caught]);
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
	const isAlreadyHidden = writingContainerShape.props.h === 0 && typeof writingContainerShape.meta.savedH === 'number';
	const savedH = isAlreadyHidden ? writingContainerShape.meta.savedH : writingContainerShape.props.h;

	silentlyChangeStore(editor, () => {
		unlockShape(editor, writingContainerShape);
		// editor.updateShape() is silently ignored when isReadonly is true,
		// so update the store directly instead.
		editor.store.update(writingContainerShape.id, (record: TLUnknownShape) => {
			const prev = narrowStoreRecordToShape(record);
			return {
				...prev,
				props: { ...prev.props, h: 0 },
				meta: { ...prev.meta, savedH: savedH },
			};
		});
		lockShape(editor, writingContainerShape);
	});
}

export const hideWritingLines = (editor: Editor) => {
	const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId) as WritingLines;
	if (!writingLinesShape) return;
	const isAlreadyHidden = writingLinesShape.props.h === 0 && typeof writingLinesShape.meta.savedH === 'number';
	const savedH = isAlreadyHidden ? writingLinesShape.meta.savedH : writingLinesShape.props.h;

	silentlyChangeStore(editor, () => {
		unlockShape(editor, writingLinesShape);
		// editor.updateShape() is silently ignored when isReadonly is true,
		// so update the store directly instead.
		editor.store.update(writingLinesShape.id, (record: TLUnknownShape) => {
			const prev = narrowStoreRecordToShape(record);
			return {
				...prev,
				props: { ...prev.props, h: 0 },
				meta: { ...prev.meta, savedH: savedH },
			};
		});
		lockShape(editor, writingLinesShape);
	});
}

export const unhideWritingContainer = (editor: Editor) => {
	const writingContainerShape = editor.getShape('shape:writing-container' as TLShapeId) as WritingContainer;
	if (!writingContainerShape) return;
	const h = writingContainerShape.meta.savedH;
	if (typeof h !== 'number') return;

	silentlyChangeStore(editor, () => {
		unlockShape(editor, writingContainerShape);
		// editor.updateShape() is silently ignored when isReadonly is true,
		// so update the store directly instead.
		editor.store.update(writingContainerShape.id, (record: TLUnknownShape) => {
			const prev = narrowStoreRecordToShape(record);
			const metaBase =
				prev.meta && typeof prev.meta === "object" && !Array.isArray(prev.meta)
					? { ...(prev.meta as Record<string, unknown>) }
					: {};
			const { savedH: _discardSavedHeight, ...restMeta } = metaBase;
			return { ...prev, props: { ...prev.props, h: h }, meta: restMeta } as TLUnknownShape;
		});
		lockShape(editor, writingContainerShape);
	});
}

export const unhideWritingLines = (editor: Editor) => {
	const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId) as WritingLines;
	if (!writingLinesShape) return;
	const h = writingLinesShape.meta.savedH;
	if (typeof h !== 'number') return;

	silentlyChangeStore(editor, () => {
		unlockShape(editor, writingLinesShape);
		// editor.updateShape() is silently ignored when isReadonly is true,
		// so update the store directly instead.
		editor.store.update(writingLinesShape.id, (record: TLUnknownShape) => {
			const prev = narrowStoreRecordToShape(record);
			const metaBase =
				prev.meta && typeof prev.meta === "object" && !Array.isArray(prev.meta)
					? { ...(prev.meta as Record<string, unknown>) }
					: {};
			const { savedH: _discardSavedHeight, ...restMeta } = metaBase;
			return { ...prev, props: { ...prev.props, h: h }, meta: restMeta } as TLUnknownShape;
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

/** Lock the editor so that user input is ignored. Programmatic changes via bypassReadonly still work. */
export const lockTldrawInput = (editor: Editor) => {
	editor.updateInstanceState({ isReadonly: true });
}

/** Unlock the editor so that user input is accepted again. */
export const unlockTldrawInput = (editor: Editor) => {
	editor.updateInstanceState({ isReadonly: false });
}

/** Temporarily bypass readonly mode to run a function that modifies the store programmatically. */
export const bypassReadonly = (editor: Editor, func: () => void) => {
	const wasReadonly = editor.getInstanceState().isReadonly;
	if (wasReadonly) editor.updateInstanceState({ isReadonly: false });
	func();
	if (wasReadonly) editor.updateInstanceState({ isReadonly: true });
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


/** Writing embeds never show the drawing grid. Force isGridMode off before any other processing. */
function forceWritingSnapshotGridOff(snapshot: TLEditorSnapshot): TLEditorSnapshot {
	const session = (snapshot as { session?: { isGridMode?: boolean } }).session ?? {};
	return {
		...snapshot,
		session: {
			...session,
			isGridMode: false,
		},
	} as TLEditorSnapshot;
}

export function prepareWritingSnapshot(TLEditorSnapshot: TLEditorSnapshot): TLEditorSnapshot {
	const withGridOff = forceWritingSnapshotGridOff(TLEditorSnapshot);
	return deleteObsoleteWritingTemplateShapes(withGridOff);
}

export function prepareDrawingSnapshot(tlEditorSnapshot: TLEditorSnapshot): TLEditorSnapshot {
	return tlEditorSnapshot;
}


/***
 * Deletes obsolete template shapes but doesn't add updated ones.
 * See updateWritingStoreIfNeeded.
 * // TODO: This desperately needs unit testing as it can delete elements from the users file
 */
export function deleteObsoleteWritingTemplateShapes(TLEditorSnapshot: TLEditorSnapshot): TLEditorSnapshot {
	type LegacyTLEditorSnapshot = TLEditorSnapshot & {
		store?: TLStoreSnapshot["store"];
	};

	const updatedSnapshot: TLEditorSnapshot = JSON.parse(
		JSON.stringify(TLEditorSnapshot),
	) as TLEditorSnapshot;

	const obsoleteShapeIds: TLShapeId[] = [
		'shape:primary_container' as TLShapeId,	// From before version 0.1.192
		'shape:handwriting_lines' as TLShapeId,	// From while testing
	];

	let updatedStore: TLStoreSnapshot["store"] | undefined = updatedSnapshot.document?.store;
	if (!updatedStore) {
		// Old format (Will update on save);
		updatedStore = (TLEditorSnapshot as LegacyTLEditorSnapshot).store;
	}
	if (!updatedStore) {
		return updatedSnapshot;
	}

	const filteredStore = Object.entries(updatedStore).filter(
		([_key, tlRecord]) => {
			const isObsoleteObj = obsoleteShapeIds.some((obsId) => tlRecord.id === obsId);
			if (isObsoleteObj) {
				info(['Removing old ink elements to update file:', tlRecord])
				return false;
			}
			return true
		}
	);
	const newStore = Object.fromEntries(filteredStore) as TLStoreSnapshot["store"];
	updatedSnapshot.document = {
		...updatedSnapshot.document,
		store: newStore,
	};

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
		const newRecord = JSON.parse(JSON.stringify(record)) as TLUnknownShape;
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
		const newRecord = JSON.parse(JSON.stringify(record)) as TLUnknownShape;
		newRecord.isLocked = true;
		return newRecord;
	})

}

export function getWritingContainerBounds(editor: Editor): Box {
	const bounds = editor.getShapePageBounds('shape:writing-container' as TLShapeId)
	
	if(bounds) {
		return bounds;
	} else {
		return new Box();
	}
}






interface svgObj {
	height: number,
	width: number,
	svg: string,
};

export async function getWritingSvg(editor: Editor, curHeight?: number | null): Promise<svgObj | undefined> {
	console.debug('[ink] getWritingSvg');
	let svgObj: undefined | svgObj;
	resizeWritingTemplateTightly(editor);
	const allShapeIds = Array.from(editor.getCurrentPageShapeIds().values());
	svgObj = await editor.getSvgString(allShapeIds);
	if (curHeight != null) {
		// Restore to exactly the height before the tight resize, bypassing the buffer zone guard
		// (the guard would incorrectly keep the tight height when content is still within the buffer zone)
		resizeWritingTemplate(editor, new Box(0, 0, WRITING_PAGE_WIDTH, curHeight));
	} else {
		// Recalculate height since one wasn't passed in.
		const invitingBounds = getInvitingWritingBounds(editor);
		if (invitingBounds) resizeWritingTemplate(editor, invitingBounds);
	}
	return svgObj;
}

// REVIEW: This could recieve the handwritingContainer id and only check the obejcts that sit within it.
// Then again, I should parent them to it anyway, in which case it could just check it's descendants.
export function getAllStrokeBounds(editor: Editor): Box {
	const allStrokeBounds = getDrawShapeBounds(editor);
	
	// Set static width
	allStrokeBounds.x = 0;
	allStrokeBounds.w = WRITING_PAGE_WIDTH;
	
	// Add gap from above text as users stroke won't touch the top edge and may not be on the first line.
	allStrokeBounds.h += allStrokeBounds.y;
	allStrokeBounds.y = 0;

	return allStrokeBounds;
}

export function getDrawShapeBounds(editor: Editor): Box {
	hideWritingTemplate(editor);
	try {
		return editor.getCurrentPageBounds() || new Box(0,0)
	} finally {
		unhideWritingTemplate(editor);
	}
}

export function simplifyWritingLines(editor: Editor, entry: HistoryEntry<TLRecord>) {
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


// export function isEmptyWritingFile(editor: Editor): boolean {
// 	let contentBounds = getDrawShapeBounds(editor);
// 	if(contentBounds.height === 0) {
// 		return true;
// 	} else {
// 		return false;
// 	}
// }

/***
 * Reads the per-file line height baked into the tldraw document meta at editor mount time.
 * Falls back to the constant default so old files (no stored value) are unaffected by
 * the current global setting.
 */
export function getLineHeightFromEditor(editor: Editor): number {
	const documentRecord = editor.store.get('document:document' as TLShapeId);
	// REVIEW: Risky automated changes below. Monitor this.
	if (!documentRecord) {
		return WRITING_LINE_HEIGHT;
	}
	const meta = (documentRecord as { meta?: unknown }).meta;
	if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) {
		return WRITING_LINE_HEIGHT;
	}
	if (!('writingLineHeight' in meta)) {
		return WRITING_LINE_HEIGHT;
	}
	const storedLineHeight =
		"writingLineHeight" in meta
			? (meta as Record<string, unknown>).writingLineHeight
			: undefined;
	const isValidLineHeight = typeof storedLineHeight === 'number' && storedLineHeight > 0;
	if (isValidLineHeight) return storedLineHeight;
	return WRITING_LINE_HEIGHT;
}

/***
 * Convert an existing writing height to a value with just enough space under writing strokes to view baseline.
 * Good for screenshots and other non-interactive states.
 */
export function cropWritingStrokeHeightTightly(height: number, lineHeight: number = WRITING_LINE_HEIGHT): number {
	const minPageHeight = lineHeight * 2.5;
	const numFilledLines = Math.ceil(height / lineHeight);
	const newLineHeight = (numFilledLines + 0.5) * lineHeight;
	return Math.max(newLineHeight, minPageHeight)
}

/***
 * Convert an existing writing height to a value with excess space under writing strokes to to enable further writing.
 * Good for while in editing mode.
 * bufferLines: number of empty writable lines to show below content. An additional 0.5 lines of visual padding is always added.
 */
export function cropWritingStrokeHeightInvitingly(height: number, bufferLines: number = 2, lineHeight: number = WRITING_LINE_HEIGHT): number {
	const minPageHeight = lineHeight * 2.5;
	const numOfLines = Math.ceil(height / lineHeight);
	const newLineHeight = (numOfLines + bufferLines + 0.5) * lineHeight;
	return Math.max(newLineHeight, minPageHeight);
}

// Returns bounds sized for editing (with inviting extra space)
export function getInvitingWritingBounds(editor: Editor): Box | null {
	const {plugin} = getGlobals()
	let contentBounds = getAllStrokeBounds(editor);
	if (!contentBounds) return null;
	const lineHeight = getLineHeightFromEditor(editor);
	const newContentBounds = new Box(contentBounds.x, contentBounds.y, contentBounds.w, cropWritingStrokeHeightInvitingly(contentBounds.h, plugin.settings.writingBufferLines, lineHeight));
	console.debug('[ink] getInvitingWritingBounds invitingWritingBounds', newContentBounds);
	return newContentBounds;
}

// Returns bounds sized tightly for preview/screenshot (minimal extra space)
export function getTightWritingBounds(editor: Editor): Box | null {
	const {plugin} = getGlobals()
	let contentBounds = getAllStrokeBounds(editor);
	if (!contentBounds) return null;
	const lineHeight = getLineHeightFromEditor(editor);
	const newContentBounds = new Box(contentBounds.x, contentBounds.y, contentBounds.w, cropWritingStrokeHeightTightly(contentBounds.h, lineHeight));
	console.debug('[ink] getTightWritingBounds tightWritingBounds', newContentBounds);
	return newContentBounds;
}

// Shared helper to resize container and lines to given bounds
export function resizeWritingTemplate(editor: Editor, contentBounds: Box) {
	const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId) as WritingLines;
	const writingContainerShape = editor.getShape('shape:writing-container' as TLShapeId) as WritingContainer;
	
	if(!writingLinesShape) return;
	if(!writingContainerShape) return;

	const prevLinesH = writingLinesShape.props.h;
	const prevContainerH = writingContainerShape.props.h;
	info(['resizeWritingTemplate BEFORE', { prevLinesH, prevContainerH, targetH: contentBounds.h }]);
	
	silentlyChangeStore( editor, () => {
		unlockShape(editor, writingContainerShape);
		unlockShape(editor, writingLinesShape);

		// editor.updateShape() is silently ignored when isReadonly is true,
		// so update the store directly instead.
		editor.store.update(writingContainerShape.id, (record: TLUnknownShape) => {
			const prev = narrowStoreRecordToShape(record);
			return {
				...prev,
				props: { ...prev.props, h: contentBounds.h },
			};
		});
		editor.store.update(writingLinesShape.id, (record: TLUnknownShape) => {
			const prev = narrowStoreRecordToShape(record);
			return {
				...prev,
				props: { ...prev.props, h: contentBounds.h },
			};
		});

		lockShape(editor, writingContainerShape);
		lockShape(editor, writingLinesShape);
	})

	const afterLinesShape = editor.getShape('shape:writing-lines' as TLShapeId) as WritingLines;
	const afterContainerShape = editor.getShape('shape:writing-container' as TLShapeId) as WritingContainer;
	const afterGeom = editor.getShapeGeometry(afterLinesShape);
	info(['resizeWritingTemplate AFTER', {
		afterLinesH: afterLinesShape?.props.h,
		afterContainerH: afterContainerShape?.props.h,
		geomBoundsH: afterGeom?.bounds.h,
		geomBoundsW: afterGeom?.bounds.w,
	}]);
}


/***
 * Resize the writing template to the inviting height based on current content.
 * Always applies — no buffer zone guard.
 * Use on mount or whenever an unconditional restore to inviting height is needed.
 * Returns the new applied height, or null if no content bounds could be computed.
 */
export const resizeWritingTemplateInvitingly = (
	editor: Editor,
): number | null => {
	console.debug('[ink] resizeWritingTemplateInvitingly');
	const contentBounds = getInvitingWritingBounds(editor);
	if (!contentBounds) return null;
	resizeWritingTemplate(editor, contentBounds);
	return contentBounds.h;
}

/***
 * Pure predicate: should the writing template resize given a new computed height?
 * Extracted so the guard logic can be unit-tested without a live tldraw Editor.
 */
export function shouldResizeForNewHeight(
	newHeight: number,
	curHeight: number | null,
	bufferLines: number,
	lineHeight: number = WRITING_LINE_HEIGHT,
): boolean {
	// First open — no previous height tracked yet
	if (curHeight === null) return true;
	// Content shrank — apply the smaller height immediately
	if (newHeight < curHeight) return true;
	// Content has grown past the buffer zone — time to expand
	if (newHeight > curHeight + (bufferLines - 1) * lineHeight) return true;
	// Content is still within the existing buffer zone — no resize needed
	return false;
}

/***
 * Resize the writing template to the inviting height only when necessary.
 * Skips the resize if content is still within the existing buffer zone,
 * preventing unnecessary resizes while the user is writing.
 * Returns the new applied height, or curHeight if no resize was needed.
 * The caller is responsible for storing the returned value for the next call.
 */
export const resizeWritingTemplateInvitinglyIfNecessary = (
	editor: Editor,
	curHeight: number | null
): number | null => {
	console.debug('[ink] resizeWritingTemplateInvitinglyIfNecessary');
	const contentBounds = getInvitingWritingBounds(editor);
	if (!contentBounds) {
		info('NO contentBounds, returning null');
		return null;
	}
	const {plugin} = getGlobals()

	const newHeight = contentBounds.h;
	const lineHeight = getLineHeightFromEditor(editor);
	const shouldResize = shouldResizeForNewHeight(newHeight, curHeight, plugin.settings.writingBufferLines, lineHeight);

	info(['shouldResize decision', {
		curHeight,
		newHeight,
		lineHeight,
		bufferLines: plugin.settings.writingBufferLines,
		shouldResize,
	}]);

	if (shouldResize) {
		resizeWritingTemplate(editor, contentBounds);
		return newHeight;
	}

	// Content is still within the existing buffer zone — no resize needed
	return curHeight;
}

/***
 * Add just enough space under writing strokes to view baseline.
 * Good for screenshots and other non-interactive states.
 */
export const resizeWritingTemplateTightly = (editor: Editor) => {
	verbose('resizeWritingTemplateTightly')
	console.debug('[ink] resizeWritingTemplateTightly');
	const contentBounds = getTightWritingBounds(editor);
	if (!contentBounds) return;
	resizeWritingTemplate(editor, contentBounds);
}

/***
 * Extend the writing template height to fill the available viewport in the dedicated writing view.
 * Only ever grows the template — never shrinks it.
 * Returns the new height if it was extended, or null if already tall enough.
 */
export function extendWritingTemplateToFillViewport(editor: Editor, topReservedPx: number = 0): number | null {
	const zoom = editor.getZoomLevel();
	const viewportHeight = editor.getViewportScreenBounds().h;
	const lineHeight = getLineHeightFromEditor(editor);
	// Include 10 extra line heights so lines cover the full scrollable area past the viewport
	const availablePageHeight = (viewportHeight - topReservedPx) / zoom + 10 * lineHeight;

	const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId);
	if (!writingLinesShape || writingLinesShape.type !== 'writing-lines') return null;
	const writingLinesHeight = (writingLinesShape as WritingLines).props.h;
	if (writingLinesHeight >= availablePageHeight) return null;

	resizeWritingTemplate(editor, new Box(0, 0, WRITING_PAGE_WIDTH, availablePageHeight));
	return availablePageHeight;
}

/***
 * Resize the writing template for the dedicated (non-embed) writing view.
 * Unlike the embed-oriented helpers, this:
 * - Accounts for the current scroll position so lines always fill the visible scrollable area.
 * - Takes the maximum of content+bufferLines and currentViewportBottom+10 lines.
 * - Never shrinks the template — only grows it.
 * Returns the current template height (grown or unchanged), or null if the shape cannot be found.
 */
export function resizeWritingTemplateForDedicatedView(editor: Editor): number | null {
	const camera = editor.getCamera();
	const viewportHeight = editor.getViewportScreenBounds().h;
	const zoom = editor.getZoomLevel();
	const lineHeight = getLineHeightFromEditor(editor);

	// Viewport bottom in page coordinates — correctly accounts for current scroll position
	const pageBottomVisible = (viewportHeight - camera.y) / zoom;
	const minFromViewport = pageBottomVisible + 10 * lineHeight;

	// Content-based minimum: strokes + user-configured buffer lines
	const contentBounds = getInvitingWritingBounds(editor);
	const minFromContent = contentBounds ? contentBounds.h : 0;

	const targetHeight = Math.max(minFromViewport, minFromContent);

	const writingLinesRaw = editor.getShape('shape:writing-lines' as TLShapeId);
	if (!writingLinesRaw || writingLinesRaw.type !== 'writing-lines') return null;
	const writingLinesShape = writingLinesRaw as WritingLines;
	// Never shrink
	if (writingLinesShape.props.h >= targetHeight) return writingLinesShape.props.h;

	resizeWritingTemplate(editor, new Box(0, 0, WRITING_PAGE_WIDTH, targetHeight));
	return targetHeight;
}



export async function getDrawingSvg(editor: Editor): Promise<svgObj | undefined> {
	const allShapeIds = Array.from(editor.getCurrentPageShapeIds().values());
	const svgObj = await editor.getSvgString(allShapeIds);
	return svgObj;
}


/***
 * Focus the tldraw editor contained inside the passed in html element without scrolling.
 * If element doesn't exist, function will do nothing.
 */
export function focusChildTldrawEditor(containerEl: HTMLElement | null) {
	if(containerEl) {
		containerEl.find('.tl-container').focus({preventScroll: true});
	}
}