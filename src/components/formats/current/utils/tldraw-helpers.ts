import { Editor, HistoryEntry, TLStoreSnapshot, TLRecord, TLShape, TLShapeId, TLUnknownShape, setUserPreferences, Box, TLEditorSnapshot } from "tldraw";
import { WRITING_LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from "src/constants";
import { useRef } from 'react';
import InkPlugin from "src/main";
import { showStrokeLimitTips_maybe } from "src/components/dom-components/stroke-limit-notice";
import { info, verbose } from "../../../../logic/utils/log-to-console";
import { WritingContainer } from "../writing/shapes/writing-container";
import { WritingLines } from "../writing/shapes/writing-lines";
import { importSvgToTldraw, parseSvgToShapes } from "./importSvgToTldraw";
import { getGlobals } from "src/stores/global-store";

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
	if (!tlCanvas) return () => {};

	// 设置touch-action以支持缩放
	tlCanvas.style.touchAction = 'auto';

	// 跟踪当前触摸点数量
	let touchCount = 0;

	// 触摸事件处理函数
	const handleTouchStart = (e: TouchEvent) => {
		touchCount = e.touches.length;
	};

	const handleTouchMove = (e: TouchEvent) => {
		// 更新当前触摸点数量
		touchCount = e.touches.length;
		
		// 单指触摸：阻止冒泡和默认行为，防止触发Obsidian的滚动
		if (touchCount === 1) {
			e.stopPropagation();
			e.preventDefault();
		}
		// 双指及以上触摸：允许冒泡和默认行为，保留缩放功能
	};

	const handleTouchEnd = (e: TouchEvent) => {
		touchCount = e.touches.length;
	};

	const handleTouchCancel = (e: TouchEvent) => {
		touchCount = e.touches.length;
	};

	// 处理右键菜单事件 - 确保tldraw的右键菜单能正常显示
	const handleContextMenu = (e: MouseEvent) => {
		// 检查事件目标是否为tldraw画布或其子元素
		const isCanvasElement = e.target === tlCanvas || tlCanvas.contains(e.target as Node);
		if (isCanvasElement) {
			// 阻止默认行为，防止Obsidian的右键菜单显示
			e.preventDefault();
			// 不阻止冒泡，允许tldraw捕获事件并显示自己的菜单
			// 注意：不使用e.stopPropagation()
		}
	};

	// 添加事件监听器
	tlCanvas.addEventListener('touchstart', handleTouchStart, { passive: true });
	// 使用passive: false允许preventDefault生效
	tlCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });
	tlCanvas.addEventListener('touchend', handleTouchEnd, { passive: true });
	tlCanvas.addEventListener('touchcancel', handleTouchCancel, { passive: true });
	// 使用capture模式确保先于其他事件监听器捕获事件
	tlCanvas.addEventListener('contextmenu', handleContextMenu, { capture: true });

	// 返回清理函数
	return () => {
		tlCanvas.removeEventListener('touchstart', handleTouchStart);
		tlCanvas.removeEventListener('touchmove', handleTouchMove);
		tlCanvas.removeEventListener('touchend', handleTouchEnd);
		tlCanvas.removeEventListener('touchcancel', handleTouchCancel);
		tlCanvas.removeEventListener('contextmenu', handleContextMenu);
	};
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
	if (!allShapesBounds) {
		// Adjust zoom to to make line thickness similar to writing
		const curCameraProps = editor.getCamera();
		editor.setCamera({ ...curCameraProps, z: 0.3 })
		return;
	};

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

	// 放宽y轴限制，允许相机在B区定位（writing-zone上方）
	const yMin = bounds.minY - 1500; // 从-500放宽到-1500，允许相机在B区定位
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
			verbose('Error from stashing stale content (when calling showStrokeLimitTips_maybe)', error);
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
			isLocked: true,
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
			isLocked: true,
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
	// 确保meta属性存在，如果不存在使用默认值
	const h = writingContainerShape.meta?.savedH || WRITING_MIN_PAGE_HEIGHT;

	silentlyChangeStore(editor, () => {
		unlockShape(editor, writingContainerShape);
		editor.updateShape({
			id: writingContainerShape.id,
			type: writingContainerShape.type,
			isLocked: true,
			props: {
				h: h,
			},
			// 确保meta属性是一个有效的、可JSON序列化的空对象
			meta: {}
		});
		lockShape(editor, writingContainerShape);
	});
}

export const unhideWritingLines = (editor: Editor) => {
	const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId) as WritingLines;
	if (!writingLinesShape) return;
	// 确保meta属性存在，如果不存在使用默认值
	const h = writingLinesShape.meta?.savedH || WRITING_MIN_PAGE_HEIGHT;

	silentlyChangeStore(editor, () => {
		unlockShape(editor, writingLinesShape);
		editor.updateShape({
			id: writingLinesShape.id,
			type: writingLinesShape.type,
			isLocked: true,
			props: {
				h: h,
			},
			// 确保meta属性是一个有效的、可JSON序列化的空对象
			meta: {}
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


export function prepareWritingSnapshot(TLEditorSnapshot: TLEditorSnapshot): TLEditorSnapshot {
	// 先删除过时的形状
	const updatedSnapshot = deleteObsoleteWritingTemplateShapes(TLEditorSnapshot);
    
	// 创建深拷贝以避免修改原始数据并确保JSON可序列化
	const fixedSnapshot = JSON.parse(JSON.stringify(updatedSnapshot));
    
	// 检查并修复document.store中的所有shape记录
	let store = fixedSnapshot?.document?.store;
	if(!store) {
		// 兼容旧格式
		store = fixedSnapshot.store;
	}
    
	// 更全面地检查和修复所有可能的存储位置
	const storesToCheck = [store];
	if (fixedSnapshot?.stores) {
		storesToCheck.push(...Object.values(fixedSnapshot.stores));
	}
    
	storesToCheck.forEach((storeInstance) => {
		if (storeInstance) {
			Object.values(storeInstance).forEach((record: any) => {
				// 确保所有writing-container形状都有meta属性
				if (record.typeName === 'shape' && record.type === 'writing-container') {
					// 如果meta不存在、不是对象或者不是JSON可序列化的，设置为空对象
					if (record.meta === undefined || record.meta === null || typeof record.meta !== 'object') {
						record.meta = {};
					}
				}
			});
		}
	});
    
	return fixedSnapshot;
}

export function prepareDrawingSnapshot(
	tlEditorSnapshot: TLEditorSnapshot, 
	editor?: Editor, 
	filePath?: string
): TLEditorSnapshot {
	// 创建深拷贝以避免修改原始数据并确保JSON可序列化
	const fixedSnapshot = JSON.parse(JSON.stringify(tlEditorSnapshot));
	
	// 确保快照符合Tldraw迁移要求的基本结构
	if (!fixedSnapshot.document) {
		fixedSnapshot.document = {};
	}
	
	if (!fixedSnapshot.document.store) {
		fixedSnapshot.document.store = {};
	}
	
	// 确保store有正确的schema结构
	if (!fixedSnapshot.document.store.schema) {
		fixedSnapshot.document.store.schema = {
			schemaVersion: 2,
			sequences: {
				"com.tldraw.store": 4,
				"com.tldraw.asset": 1,
				"com.tldraw.camera": 1,
				"com.tldraw.document": 2,
				"com.tldraw.instance": 25,
				"com.tldraw.instance_page_state": 5,
				"com.tldraw.page": 1,
				"com.tldraw.instance_presence": 5,
				"com.tldraw.pointer": 1,
				"com.tldraw.shape": 4,
				"com.tldraw.asset.bookmark": 2,
				"com.tldraw.asset.image": 5,
				"com.tldraw.asset.video": 5,
				"com.tldraw.shape.group": 0,
				"com.tldraw.shape.text": 2,
				"com.tldraw.shape.bookmark": 2,
				"com.tldraw.shape.draw": 2,
				"com.tldraw.shape.geo": 9,
				"com.tldraw.shape.note": 7,
				"com.tldraw.shape.line": 5,
				"com.tldraw.shape.frame": 0,
				"com.tldraw.shape.arrow": 5,
				"com.tldraw.shape.highlight": 1,
				"com.tldraw.shape.embed": 4,
				"com.tldraw.shape.image": 4,
				"com.tldraw.shape.video": 2
			}
		};
	}
	
	// 检查并修复document.store中的所有shape记录
	let store = fixedSnapshot?.document?.store;
	if(!store) {
		// 兼容旧格式
		store = fixedSnapshot.store;
	}
	
	// 更全面地检查和修复所有可能的存储位置
	const storesToCheck = [store];
	if (fixedSnapshot?.stores) {
		storesToCheck.push(...Object.values(fixedSnapshot.stores));
	}
	
	storesToCheck.forEach((storeInstance) => {
		try {
			// 确保storeInstance是对象类型
			if (!storeInstance || typeof storeInstance !== 'object' || storeInstance === null) {
				return;
			}
			
			// 修复多图问题：首先收集所有image形状的assetId信息
			const imageShapeAssetIds = new Set<string>();
			
			// 首先清理无效记录（typeName为undefined的记录）
			let deletedCount = 0;
			Object.keys(storeInstance).forEach((key) => {
				const record = storeInstance[key];
				if (!record || typeof record !== 'object' || record === null) {
					// 删除无效记录
					delete storeInstance[key];
					deletedCount++;
				} else if (record.typeName === undefined || record.typeName === null) {
					// 特殊处理schema记录：如果key是'schema'且记录有schemaVersion属性，则保留并添加typeName
					if (key === 'schema' && record.schemaVersion !== undefined) {
						record.typeName = 'store-schema';
					} else if (key.startsWith('asset:') && record.type !== undefined) {
						// 修复asset记录的typeName
						record.typeName = 'asset';
					} else if (key.startsWith('shape:') && record.type !== undefined) {
						// 修复shape记录的typeName
						record.typeName = 'shape';
					} else if (key.startsWith('instance:') || key.startsWith('camera:') || key.startsWith('page:') || key.startsWith('pointer:')) {
						// 根据key前缀推断typeName
						const prefix = key.split(':')[0];
						record.typeName = prefix;
					} else {
						// 无法确定类型的记录，尝试根据内容推断
						if (record.type && typeof record.type === 'string') {
							if (record.type === 'image' || record.type === 'video' || record.type === 'bookmark') {
								record.typeName = 'asset';
							} else if (['draw', 'geo', 'text', 'frame', 'arrow', 'note', 'line', 'highlight', 'embed', 'group', 'writing-container', 'writing-lines'].includes(record.type)) {
								record.typeName = 'shape';
							} else {
								// 无法确定类型，删除记录以避免错误
								delete storeInstance[key];
								deletedCount++;
								return;
							}
						} else {
							// 无法确定类型的记录，删除以避免错误
							delete storeInstance[key];
							deletedCount++;
							return;
						}
					}
				}
			});
			
			Object.values(storeInstance).forEach((record: any) => {
				if (record.typeName === 'shape' && record.type === 'image' && record.props?.assetId) {
					imageShapeAssetIds.add(record.props.assetId);
				}
			});
			
			// 处理所有记录
			Object.values(storeInstance).forEach((record: any) => {
				try {
					// 确保记录是有效对象
					if (!record || typeof record !== 'object' || record === null) {
						return;
					}
					
					// 确保typeName存在且有效
					if (!record.typeName || typeof record.typeName !== 'string') {
						console.warn('Record with invalid typeName, skipping:', record.id);
						return;
					}
					
					// 解锁所有锁定的形状，确保SVG可以正确生成
				if (record.typeName === 'shape' && record.isLocked === true) {
					record.isLocked = false;
				}
				
				// 确保所有形状都有有效的meta属性
				if (record.typeName === 'shape' && (record.meta === undefined || record.meta === null || typeof record.meta !== 'object')) {
					record.meta = {};
				}
				
				// 修复可能存在的无效属性
				if (record.typeName === 'shape') {
				// 确保props对象存在且有效
				if (!record.props || typeof record.props !== 'object') {
					record.props = {};
				}
				
				// 特殊处理图片类型的形状
				if (record.type === 'image') {
				// 保留原始ID，不强制生成新ID
				
				// 修复跨平台兼容性：优先保留原始src数据，避免过度修改
				// 注意：不要自动修复空白图片，以便检测机制能够正常工作
				// 只有当src完全不存在或为null/undefined时才设置为空字符串
				if (record.props.src === undefined || record.props.src === null) {
				// 明确保持src为空，不创建默认透明图片，以便正确检测空白图片
				record.props.src = '';
				}
				// 如果src已经是空字符串，保持原样，不要修改
				
				// 确保图片尺寸属性存在且有效
				if (!record.props.w || record.props.w <= 0 || isNaN(record.props.w)) {
					record.props.w = 300; // 默认宽度
				}
				if (!record.props.h || record.props.h <= 0 || isNaN(record.props.h)) {
					record.props.h = 200; // 默认高度
				}
				
				// 只在完全没有裁剪属性时添加默认值，避免修改已有裁剪
				if (!record.props.crop || typeof record.props.crop !== 'object') {
					record.props.crop = {
						x: 0,
						y: 0,
						w: 1,
						h: 1
					};
				}
				
				// 确保图片有正确的滤镜属性
				if (!record.props.filter || typeof record.props.filter !== 'string') {
					record.props.filter = 'none';
				}
				
				// 修复多图问题：确保assetId存在且有效
				if (!record.props.assetId || typeof record.props.assetId !== 'string') {
					// 如果assetId不存在，尝试从形状ID生成对应的assetId
					record.props.assetId = `asset:${record.id.replace('shape:', '')}`;
				}
				}
				
				// 仅在位置属性完全缺失时添加默认值，保留原始位置信息
				if (record.x === undefined || record.x === null || isNaN(record.x)) {
					record.x = 0;
				}
				if (record.y === undefined || record.y === null || isNaN(record.y)) {
					record.y = 0;
				}
				
				// 只在id完全缺失时生成临时id，避免覆盖有效id
					if (record.typeName === 'shape' && (!record.id || typeof record.id !== 'string')) {
						record.id = `shape:temp-${Math.random().toString(36).substr(2, 9)}`;
					}
				}
				} catch (error) {
					// 捕获并忽略单个记录处理中的错误，确保其他记录能继续处理
				}
			});
			
			// 修复多图问题：确保所有image形状对应的asset资源记录存在
			imageShapeAssetIds.forEach((assetId) => {
				// 检查asset资源记录是否存在
				const assetKey = `asset:${assetId.replace('asset:', '')}`;
				if (!storeInstance[assetKey]) {
					// 如果asset资源记录不存在，尝试从image形状中获取图片数据
					let imageSrc = '';
					
					// 查找对应的image形状，获取src数据
					Object.values(storeInstance).forEach((record: any) => {
						if (record.typeName === 'shape' && record.type === 'image' && record.props?.assetId === assetId) {
							// 优先使用现有的src数据
							imageSrc = record.props.src || record.props.srcData || record.props.imageData || '';
						}
					});
					
					// 如果仍然没有src数据，保持为空，不创建默认透明图片
					// 这样空白图片检测机制才能正常工作
					// imageSrc = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
					
					// 创建基础asset记录
					storeInstance[assetKey] = {
						id: assetId,
						typeName: 'asset',
						type: 'image',
						props: {
							name: 'imported-image',
							src: imageSrc, // 使用获取到的图片数据（可能为空）
							w: 300,
							h: 200,
							mimeType: 'image/png',
							isAnimated: false,
						},
						meta: {},
					};
				}
			});
		} catch (error) {
			// 捕获store级别错误，确保整体处理不中断
		}
	});
	
	// 确保document和page对象存在且有效
	if (!fixedSnapshot.document) {
		fixedSnapshot.document = {};
	}
	if (!fixedSnapshot.document.page) {
		fixedSnapshot.document.page = {};
	}
	
	// 确保store对象存在
	if (!fixedSnapshot.document.store) {
		fixedSnapshot.document.store = {};
	}
	
	return fixedSnapshot;
}






/***
 * Deletes obsolete template shapes but doesn't add updated ones.
 * See updateWritingStoreIfNeeded.
 * // TODO: This desperately needs unit testing as it can delete elements from the users file
 */
export function deleteObsoleteWritingTemplateShapes(TLEditorSnapshot: TLEditorSnapshot): TLEditorSnapshot {
	const updatedSnapshot = JSON.parse(JSON.stringify(TLEditorSnapshot));
	
	let obsoleteShapeIds: TLShapeId[] = [
		'shape:primary_container' as TLShapeId,	// From before version 0.1.192
		'shape:handwriting_lines' as TLShapeId,	// From while testing
	];

	let updatedStore = TLEditorSnapshot?.document?.store;
	if(!updatedStore) {
		// Old format (Will update on save);
		// @ts-ignore
		updatedStore = TLEditorSnapshot.store;
	}
	
	const filteredStore = Object.entries(updatedStore).filter(
		([key, tlRecord]) => {
			const isObsoleteObj = obsoleteShapeIds.some((obsId) => tlRecord.id === obsId);
			if (isObsoleteObj) {
				info(['Removing old ink elements to update file:', tlRecord])
				return false;
			}
			return true
		}
	);
	updatedStore = Object.fromEntries(filteredStore);

	return updatedSnapshot;
}


export const updateWritingStoreIfNeeded = (editor: Editor) => {
	addNewTemplateShapes(editor);
}

function addNewTemplateShapes(editor: Editor) {
	const hasLines = editor.store.has('shape:writing-lines' as TLShapeId);
	if(!hasLines) {
		// 根据屏幕宽度动态调整writing-lines形状的宽度
		const containerRect = editor.getContainer().getBoundingClientRect();
		let containerWidth = 2000; // 默认宽度
		const screenWidth = window.innerWidth;
		
		// 在小屏幕设备上减小容器宽度，确保内容能够完整显示
		if (screenWidth <= 416) { // iPhone逻辑像素宽度
			containerWidth = 800;
		} else if (screenWidth <= 768) {
			containerWidth = 1200;
		} else if (screenWidth <= 1024) {
			containerWidth = 1600;
		}
		
		editor.createShape({
			id: 'shape:writing-lines' as TLShapeId,
			type: 'writing-lines',
			props: {
				w: containerWidth // 动态设置宽度
			},
			meta: {}
		})
	}

	const hasContainer = editor.store.has('shape:writing-container' as TLShapeId);
	if(!hasContainer) {
			editor.createShape({
		id: 'shape:writing-container' as TLShapeId,
		type: 'writing-container',
		meta: {}
	})
	}
}

export function unlockShape(editor: Editor, shape: TLUnknownShape) {
	// 添加参数验证，防止undefined错误
	if (!shape || !shape.id) {
		console.warn('unlockShape: shape参数无效，跳过解锁操作', shape);
		return;
	}

	// 检查形状是否仍然存在于编辑器中
	const currentShape = editor.getShape(shape.id);
	if (!currentShape) {
		console.warn('unlockShape: 形状不存在于编辑器中，跳过解锁操作', shape.id);
		return;
	}

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
	// 添加参数验证，防止undefined错误
	if (!shape || !shape.id) {
		console.warn('lockShape: shape参数无效，跳过锁定操作', shape);
		return;
	}

	// 检查形状是否仍然存在于编辑器中
	const currentShape = editor.getShape(shape.id);
	if (!currentShape) {
		console.warn('lockShape: 形状不存在于编辑器中，跳过锁定操作', shape.id);
		return;
	}

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

export async function getWritingSvg(editor: Editor, settings?: { writingBackgroundWhenLocked?: boolean }): Promise<svgObj | undefined> {
	let svgObj: undefined | svgObj;
	resizeWritingTemplateTightly(editor);
	const allShapeIds = Array.from(editor.getCurrentPageShapeIds().values());
	svgObj = await editor.getSvgString(allShapeIds);
	resizeWritingTemplateInvitingly(editor);
	
	// If background should not be shown, make SVG background transparent
	if (svgObj && svgObj.svg && settings && !settings.writingBackgroundWhenLocked) {
		svgObj.svg = svgObj.svg.replace(/background-color:\s*rgb\([^)]*\)|background-color:\s*#[^;]*;/g, 'background-color: transparent;');
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
	let bounds = editor.getCurrentPageBounds() || new Box(0,0)
	unhideWritingTemplate(editor);
	return bounds
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
 * Convert an existing writing height to a value with just enough space under writing strokes to view baseline.
 * Good for screenshots and other non-interactive states.
 */
export function cropWritingStrokeHeightTightly(height: number): number {
	const numOfLines = Math.ceil(height / WRITING_LINE_HEIGHT);
	const newLineHeight = (numOfLines + 0.5) * WRITING_LINE_HEIGHT;
	return Math.max(newLineHeight, WRITING_MIN_PAGE_HEIGHT)
}

/***
 * Convert an existing writing height to a value with excess space under writing strokes to to enable further writing.
 * Good for while in editing mode.
 */
export function cropWritingStrokeHeightInvitingly(height: number): number {
	const numOfLines = Math.ceil(height / WRITING_LINE_HEIGHT);
	const newLineHeight = (numOfLines + 1.5) * WRITING_LINE_HEIGHT;
	return Math.max(newLineHeight, WRITING_MIN_PAGE_HEIGHT)
}


/***
 * Add excess space under writing strokes to to enable further writing.
 * Good for while in editing mode.
 */
export const resizeWritingTemplateInvitingly = (editor: Editor) => {
	verbose('resizeWritingTemplateInvitingly');
	
	let contentBounds = getAllStrokeBounds(editor);
	if (!contentBounds) return;

	contentBounds.h = cropWritingStrokeHeightInvitingly(contentBounds.h);
	//画布分区结构：
	//A区 ：书写内容移动目标区域（原大小，不放大）
	//B区 ：writing-zone上方，容器中间区域（相机位置在此）
	//C区 ：writing-zone区域（视野中心，不会被使用）
	// 补偿C区高度：由于相机定位在B区，C区不会被使用，需要补偿C区的高度
	// C区高度约为容器高度的40%（相机视野下方区域）
	const containerBounds = getWritingContainerBounds(editor);
	const cZoneHeight = containerBounds.h * 0.132
	contentBounds.h += cZoneHeight;
	
	const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId) as WritingLines;
	const writingContainerShape = editor.getShape('shape:writing-container' as TLShapeId) as WritingContainer;
	
	if(!writingLinesShape) return;
	if(!writingContainerShape) return;
	
	silentlyChangeStore( editor, () => {
		unlockShape(editor, writingContainerShape);
		unlockShape(editor, writingLinesShape);
		// resize container and lines
		editor.updateShape({
			id: writingContainerShape.id,
			type: writingContainerShape.type,
			props: {
				h: contentBounds.h,
			}
		})
		editor.updateShape({
			id: writingLinesShape.id,
			type: writingLinesShape.type,
			props: {
				h: contentBounds.h,
			}
		})
		// 锁定形状，避免选择工具显示选择框
		lockShape(editor, writingContainerShape);
		lockShape(editor, writingLinesShape);
	})
	
}

/***
 * Add just enough space under writing strokes to view baseline.
 * Good for screenshots and other non-interactive states.
 */
export const resizeWritingTemplateTightly = (editor: Editor) => {
	verbose('resizeWritingTemplateTightly')
	let contentBounds = getAllStrokeBounds(editor);
	if (!contentBounds) return;

	contentBounds.h = cropWritingStrokeHeightTightly(contentBounds.h);

	const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId) as WritingLines;
	const writingContainerShape = editor.getShape('shape:writing-container' as TLShapeId) as WritingContainer;
	
	
	silentlyChangeStore( editor, () => {
		unlockShape(editor, writingContainerShape);
		unlockShape(editor, writingLinesShape);
		// resize container and lines
		editor.updateShape({
			id: writingContainerShape.id,
			type: writingContainerShape.type,
			props: {
				h: contentBounds.h,
			}
		})
		editor.updateShape({
			id: writingLinesShape.id,
			type: writingLinesShape.type,
			props: {
				h: contentBounds.h,
			}
		})
		// 锁定形状，避免选择工具显示选择框
		lockShape(editor, writingContainerShape);
		lockShape(editor, writingLinesShape);
	})

	
}



export async function getDrawingSvg(editor: Editor, settings?: { drawingBackgroundWhenLocked?: boolean; shapes?: string[] }): Promise<svgObj | undefined> {
	// 判断是否有指定要导出的形状ID，如果没有则导出全部元素
	let shapeIds: string[];
	
	if (settings?.shapes && settings.shapes.length > 0) {
		// 使用指定的形状ID
		shapeIds = settings.shapes;
	} else {
		// 导出全部元素
		shapeIds = Array.from(editor.getCurrentPageShapeIds().values());
	}
	
	// 将string[]转换为TLShapeId[]类型
	const shapeIdsAsTlShapeIds = shapeIds as any as TLShapeId[];
	const svgObj = await editor.getSvgString(shapeIdsAsTlShapeIds);
	
	// If background should not be shown, make SVG background transparent
	if (svgObj && svgObj.svg && settings && !settings.drawingBackgroundWhenLocked) {
		svgObj.svg = svgObj.svg.replace(/background-color:\s*rgb\([^)]*\)|background-color:\s*#[^;]*;/g, 'background-color: transparent;');
	}
	
	// Add XML declaration and DOCTYPE for Windows 11 compatibility
	if (svgObj && svgObj.svg) {
		// Check if XML declaration is already present
		if (!svgObj.svg.includes('<?xml')) {
			svgObj.svg = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + 
				'<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' + 
				svgObj.svg;
		}
		// Ensure DOCTYPE is present even if XML declaration exists
		else if (!svgObj.svg.includes('<!DOCTYPE')) {
			// First, ensure we have the correct XML declaration
			svgObj.svg = svgObj.svg.replace(/<\?xml[^>]*>/, '<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
			// Then add DOCTYPE after the XML declaration
			svgObj.svg = svgObj.svg.replace('<?xml version="1.0" encoding="UTF-8" standalone="no"?>', '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">');
		}
	}
	
	return svgObj;
}


/***
 * Focus the tldraw editor contained inside the passed in html element without scrolling.
 * If element doesn't exist, function will do nothing.
 */
export function focusChildTldrawEditor(containerEl: HTMLElement | null) {
	if(containerEl) {
		const tlContainer = containerEl.querySelector('.tl-container') as HTMLElement | null;
		if (tlContainer) {
			tlContainer.focus({preventScroll: true});
		}
	}
}

/**
 * 检测快照中是否包含多图且存在空白问题
 * @param snapshot tldraw快照
 * @returns 是否检测到多图空白问题
 */


/**
 * 获取当前打开的SVG文件内容
 * @param filePath 文件路径
 * @returns SVG文件内容或null
 */
export async function getCurrentSvgFileContent(filePath: string): Promise<string | null> {
	try {
		// 获取全局插件实例
		const { plugin } = getGlobals();
		if (!plugin) {
			console.warn('无法获取插件实例，无法读取SVG文件内容');
			return null;
		}
		
		// 通过文件路径获取TFile对象
		const allFiles = plugin.app.vault.getFiles();
		const file = allFiles.find(f => f.path === filePath);
		
		if (!file) {
			console.warn(`文件不存在: ${filePath}`);
			return null;
		}
		
		if (file.extension.toLowerCase() !== 'svg') {
			console.warn(`文件不是SVG格式: ${filePath}`);
			return null;
		}
		
		// 读取SVG文件内容
		const svgContent = await plugin.app.vault.read(file);
		
		if (!svgContent) {
			console.warn(`文件内容为空: ${filePath}`);
			return null;
		}
		
		// 检查是否包含SVG标签
		const trimmedContent = svgContent.trim();
		const hasSvgTag = trimmedContent.includes('<svg') && trimmedContent.includes('</svg>');
		if (!hasSvgTag) {
			console.warn(`文件内容无效，不包含SVG标签: ${filePath}`);
			return null;
		}
		
		console.log(`成功获取SVG文件内容: ${filePath}`);
		return svgContent;
	} catch (error) {
		console.error('获取SVG文件内容失败:', error);
		return null;
	}
}

/**
 * 使用SVG导入备用机制重新导入当前文件
 * @param editor tldraw编辑器
 * @param filePath 当前打开的SVG文件路径
 * @returns 导入是否成功
 */
export async function fallbackToSvgImport(editor: Editor, filePath: string): Promise<boolean> {
	try {
		console.log(`启动SVG导入备用机制，文件: ${filePath}`);
		
		// 获取当前SVG文件内容
		const svgContent = await getCurrentSvgFileContent(filePath);
		if (!svgContent) {
			console.warn('无法获取SVG文件内容，备用机制无法执行');
			return false;
		}
		
		// 清空当前画布
		const allShapeIds = Array.from(editor.getCurrentPageShapeIds().values());
		editor.deleteShapes(allShapeIds);
		
		// 使用parseSvgToShapes解析SVG，然后调用importSvgToTldraw重新导入
		const { shapes, imageData } = parseSvgToShapes(svgContent);
		const success = importSvgToTldraw(editor, shapes, imageData, 0, 0, false);
		
		if (success) {
			console.log('SVG导入备用机制执行成功');
		} else {
			console.error('SVG导入备用机制执行失败');
		}
		
		return success;
		
	} catch (error) {
		console.error('SVG导入备用机制执行过程中出错:', error);
		return false;
	}
}

/**
 * 检测SVG文件中xlink:href属性的匹配数量
 * @param svgContent SVG文件内容
 * @returns xlink:href的匹配数量
 */
export function countImageTypesInSvg(svgContent: string): number {
	if (!svgContent) {
		return 0;
	}
	
	// 使用正则表达式匹配 xlink:href 属性
	const xlinkHrefRegex = /xlink:href/g;
	const matches = svgContent.match(xlinkHrefRegex);
	
	return matches ? matches.length : 0;
}

/**
 * 检测编辑器是否处于空状态
 * @param editor tldraw编辑器
 * @returns 编辑器是否为空
 */
export function isEditorEmpty(editor: Editor): boolean {
	if (!editor) {
		return true;
	}
	
	// 获取当前页面的所有形状ID
	const allShapeIds = Array.from(editor.getCurrentPageShapeIds().values());
	
	// 如果没有任何形状，则编辑器为空
	return allShapeIds.length === 0;
}

/**
 * 检测SVG多图问题并决定是否使用备用机制
 * @param editor tldraw编辑器
 * @param filePath 当前文件路径
 * @param svgContent SVG文件内容
 * @returns 是否启动了备用机制
 */
export async function detectAndHandleMultiImageIssue(
	editor: Editor, 
	filePath: string, 
	svgContent: string
): Promise<boolean> {
	if (!editor || !filePath || !svgContent) {
		return false;
	}
	
	// 1. 检测SVG文件中xlink:href属性的数量
	const imageTypeCount = countImageTypesInSvg(svgContent);
	
	// 2. 检测编辑器是否处于空状态
	const editorEmpty = isEditorEmpty(editor);
	
	console.log(`多图检测: SVG中xlink:href数量=${imageTypeCount}, 编辑器空状态=${editorEmpty}`);
	
	// 3. 判断条件：编辑器处于空状态且SVG中存在多图（大于1）
	if (editorEmpty && imageTypeCount > 1) {
		console.log(`检测到多图问题: 编辑器为空且SVG中有${imageTypeCount}个图片，启动备用机制...`);
		
		// 使用备用机制重新导入SVG
		const success = await fallbackToSvgImport(editor, filePath);
		
		if (success) {
			console.log('多图问题已通过SVG导入备用机制解决');
		} else {
			console.warn('SVG导入备用机制未能解决多图问题');
		}
		
		return success;
	}
	
	return false;
}