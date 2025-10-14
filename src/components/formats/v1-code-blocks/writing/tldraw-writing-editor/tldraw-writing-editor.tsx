import './tldraw-writing-editor.scss';
import { Editor, TLUiOverrides, TldrawEditor, TldrawHandles, TldrawOptions, TldrawScribble, TldrawShapeIndicators, defaultShapeTools, defaultShapeUtils, defaultTools, getSnapshot, TLEditorSnapshot, TldrawSelectionForeground, TldrawUiContextProvider } from "tldraw";
import { useRef } from "react";
import { Activity, WritingCameraLimits, adaptTldrawToObsidianThemeMode, focusChildTldrawEditor, getActivityType, getWritingContainerBounds, getWritingSvg, initWritingCamera, initWritingCameraLimits, prepareWritingSnapshot, preventTldrawCanvasesCausingObsidianGestures, resizeWritingTemplateInvitingly, restrictWritingCamera, updateWritingStoreIfNeeded, useStash } from "src/components/formats/v1-code-blocks/utils/tldraw-helpers";
import { WritingContainerUtil_v1 } from "src/components/formats/v1-code-blocks/writing/writing-shapes/writing-container"
import { WritingMenu } from "src/components/jsx-components/writing-menu/writing-menu";
import InkPlugin from "src/main";
import * as React from "react";
import { MENUBAR_HEIGHT_PX, WRITE_LONG_DELAY_MS, WRITE_SHORT_DELAY_MS, WRITING_LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from 'src/constants';
import { InkFileData_v1 } from 'src/components/formats/v1-code-blocks/types/file-data';
import { buildWritingFileData_v1 } from 'src/components/formats/v1-code-blocks/utils/build-file-data';
import { TFile } from 'obsidian';
import { PrimaryMenuBar } from 'src/components/jsx-components/primary-menu-bar/primary-menu-bar';
import ExtendedWritingMenu from 'src/components/jsx-components/extended-writing-menu/extended-writing-menu';
import classNames from 'classnames';
import { WritingLinesUtil_v1 } from '../writing-shapes/writing-lines';
import { editorActiveAtom_v1, WritingEmbedState_v1, embedStateAtom_v1 } from '../writing-embed-editor/writing-embed';
import { useAtomValue, useSetAtom } from 'jotai';
import { getInkFileData } from 'src/components/formats/v1-code-blocks/utils/getInkFileData';
import { svgToPngDataUri } from 'src/logic/utils/screenshots';
import { verbose } from 'src/logic/utils/log-to-console';
import { FingerBlocker } from 'src/components/jsx-components/finger-blocker/finger-blocker';

///////
///////

interface TldrawWritingEditorProps_v1 {
	onResize?: Function,
	plugin: InkPlugin,
	writingFile: TFile,
	save: (inkFileData: InkFileData_v1) => void,
	extendedMenu?: any[],

	// For embeds
	embedded?: boolean,
	resizeEmbedContainer?: (pxHeight: number) => void,
	closeEditor?: Function,
	saveControlsReference?: Function,
}

// Wraps the component so that it can full unmount when inactive
export const TldrawWritingEditorWrapper_v1: React.FC<TldrawWritingEditorProps_v1> = (props) => {
    const editorActive = useAtomValue(editorActiveAtom_v1);

    if(editorActive) {
        return <TldrawWritingEditor_v1 {...props} />
    } else {
        return <></>
    }
}

const MyCustomShapes_v1 = [WritingContainerUtil_v1, WritingLinesUtil_v1];
// tldraw配置选项
const tlOptions_v1: Partial<TldrawOptions> = {
	defaultSvgPadding: 0
	// overrides属性已移除，因为它不在TldrawOptions类型中
}

export function TldrawWritingEditor_v1(props: TldrawWritingEditorProps_v1) {

	const [tlEditorSnapshot, setTlEditorSnapshot] = React.useState<TLEditorSnapshot>();
	const setEmbedState = useSetAtom(embedStateAtom_v1);
	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const tlEditorRef = useRef<Editor>();
	const tlEditorWrapperElRef = useRef<HTMLDivElement>(null);
	const removeUserActionListenerRef = useRef<() => void>();
	const cameraLimitsRef = useRef<WritingCameraLimits | null>(null);
	// 使用useStash hook获取stashStaleContent和unstashStaleContent函数
	const { stashStaleContent, unstashStaleContent } = useStash(props.plugin);
	const [preventTransitions, setPreventTransitions] = React.useState<boolean>(true);
	const recentPenInput = useRef<boolean>(false);

	// On mount
	React.useEffect( ()=> {
		verbose('EDITOR mounted');
		fetchFileData();
		return () => {
			verbose('EDITOR unmounting');
			// 确保在组件卸载时移除用户操作监听器
			if (removeUserActionListenerRef.current) {
				removeUserActionListenerRef.current();
			}
		}
	}, [])

	if(!tlEditorSnapshot) return <></>
	verbose('EDITOR snapshot loaded')

	////////

	const defaultComponents = {
		Scribble: TldrawScribble,
		ShapeIndicators: TldrawShapeIndicators,
		CollaboratorScribble: TldrawScribble,
		SelectionForeground: TldrawSelectionForeground,
		Handles: TldrawHandles,
	}

	const handleMount = (_tlEditor: Editor) => {
		const tlEditor = tlEditorRef.current = _tlEditor;
		setEmbedState(WritingEmbedState_v1.editor);
		focusChildTldrawEditor(tlEditorWrapperElRef.current);
		preventTldrawCanvasesCausingObsidianGestures(tlEditor);

		// 确保编辑器使用"draw"工具，这是默认的绘图工具
		tlEditor.setCurrentTool('draw');

		// 设置默认笔刷颜色和大小
		if (tlEditor.styleProps && tlEditor.styleProps.geo) {
		  // 找到 color 的样式属性对象
		  for (const [key, value] of tlEditor.styleProps.geo.entries()) {
			if (value === "color") {
			  key.defaultValue = "light-blue"; // 默认颜色
			} else if (value === "size") {
			  key.defaultValue = "m"; // 默认大小
			}
		  }
		}

		// 调用 updateWritingStoreIfNeeded 函数确保状态正确更新
		// 这有助于确保默认颜色设置立即生效
		updateWritingStoreIfNeeded(tlEditor);

		// 通知编辑器状态已更改，确保颜色设置生效
		queueOrRunStorePostProcesses(tlEditor);

		resizeContainerIfEmbed(tlEditorRef.current);
		if(tlEditorWrapperElRef.current) {
			// Makes the editor visible inly after it's fully mounted
			tlEditorWrapperElRef.current.style.opacity = '1';
		}
		
		// tldraw content setup
		adaptTldrawToObsidianThemeMode(tlEditor);
		resizeWritingTemplateInvitingly(tlEditor);
		resizeContainerIfEmbed(tlEditor);	// Has an effect if the embed is new and started at 0

				
		// view set up
		if(props.embedded) {
			initWritingCamera(tlEditor);
			// 移除嵌入式模式下的相机锁定，允许iOS设备上的缩放功能
			// tlEditor.setCameraOptions({
			// 		isLocked: true,
			// })
		} else {
			initWritingCamera(tlEditor, MENUBAR_HEIGHT_PX);
			cameraLimitsRef.current = initWritingCameraLimits(tlEditor);
		}

		// 隐藏收费按钮
		const licenseButton = tlEditor.getContainer().querySelector('.tl-watermark_SEE-LICENSE[data-unlicensed="true"] > button');
		if (licenseButton) {
			(licenseButton as HTMLElement).style.display = 'none';
		}

		// Runs on any USER caused change to the store, (Anything wrapped in silently change method doesn't call this).
		// 存储removeUserActionListener到ref中，以便在组件卸载时可以访问
		removeUserActionListenerRef.current = tlEditor.store.listen((entry) => {
			if(!tlEditorWrapperElRef.current) return;

			const activity = getActivityType(entry);
			switch (activity) {
				case Activity.PointerMoved:
					// REVIEW: Consider whether things are being erased
					break;

				case Activity.CameraMovedAutomatically:
				case Activity.CameraMovedManually:
				// restrictWritingCamera函数不存在，注释掉
				unstashStaleContent(tlEditor);
				break;

				case Activity.DrawingStarted:
					resetInputPostProcessTimers();
					stashStaleContent(tlEditor);
					break;
					
				case Activity.DrawingContinued:
					resetInputPostProcessTimers();
					break;
							
				case Activity.DrawingCompleted:
					queueOrRunStorePostProcesses(tlEditor);
					break;
					
				case Activity.DrawingErased:
					queueOrRunStorePostProcesses(tlEditor);
					break;
				
				default:
					// Catch anything else not specifically mentioned (ie. draw shape, etc.)
					// queueOrRunStorePostProcesses(editor);
					// verbose('Activity not recognised.');
					// verbose(['entry', entry], {freeze: true});
			}

		}, {
			source: 'user',	// Local changes
			scope: 'all'	// Filters some things like camera movement changes. But Not sure it's locked down enough, so leaving as all.
		})

		const unmountActions = () => {
			// NOTE: This prevents the postProcessTimer completing when a new file is open and saving over that file.
			resetInputPostProcessTimers();
			if (removeUserActionListenerRef.current) {
				removeUserActionListenerRef.current();
			}
		}

		if(props.saveControlsReference) {
			props.saveControlsReference({
				save: () => completeSave(tlEditor),
				saveAndHalt: async (): Promise<void> => {
					await completeSave(tlEditor);
					unmountActions();	// Clean up immediately so nothing else occurs between this completeSave and a future unmount
				},
				resize: () => {
					const camera = tlEditor.getCamera()
					const cameraY = camera.y;
					initWritingCamera(tlEditor);
					tlEditor.setCamera({x: camera.x, y: cameraY})
				}
			})
		}
		
		return () => {
			unmountActions();
		};
	}

	///////////////

	function resizeContainerIfEmbed (editor: Editor) {
		if (!props.embedded || !props.onResize) return;

		const embedBounds = editor.getViewportScreenBounds();
		const contentBounds = getWritingContainerBounds(editor);
		
		if (contentBounds) {
			const contentRatio = contentBounds.w / contentBounds.h;
			const newEmbedHeight = embedBounds.w / contentRatio;
			props.onResize(newEmbedHeight);
		}

	}

	const queueOrRunStorePostProcesses = (editor: Editor) => {
		instantInputPostProcess(editor);
		smallDelayInputPostProcess(editor);
		longDelayInputPostProcess(editor);
	}

	// Use this to run optimisations that that are quick and need to occur immediately on lifting the stylus
	const instantInputPostProcess = (editor: Editor) => { //, entry?: HistoryEntry<TLRecord>) => {
		resizeWritingTemplateInvitingly(editor);
		resizeContainerIfEmbed(editor);
		// entry && simplifyLines(editor, entry);
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
		// verbose('incrementalSave');
		unstashStaleContent(editor);
		const tlEditorSnapshot = getSnapshot(editor.store);
		stashStaleContent(editor);

		const pageData = buildWritingFileData_v1({
			tlEditorSnapshot: tlEditorSnapshot,
			previewIsOutdated: true,
		})
		props.save(pageData);
	}

	const completeSave = async (editor: Editor): Promise<void> => {
		// verbose('completeSave');
		let previewUri;
		
		unstashStaleContent(editor);
		const tlEditorSnapshot = getSnapshot(editor.store);
		const svgObj = await getWritingSvg(editor);
		stashStaleContent(editor);
		
		// 修复writing-container形状的meta属性
		const modifiedSnapshot = JSON.parse(JSON.stringify(tlEditorSnapshot));
		const store = modifiedSnapshot?.document?.store || modifiedSnapshot.store;
		if (store) {
			Object.values(store).forEach((record: any) => {
				if (record.typeName === 'shape' && record.type === 'writing-container' && record.meta === undefined) {
					record.meta = {};
				}
			});
		}

		// 获取当前选中的形状，如果有选中的，就用它的颜色和大小
		let currentColor = 'light-blue';
		let currentSize = 'm';
		const selectedShapes = editor.getSelectedShapes();
		if (selectedShapes.length > 0) {
			const firstShape = selectedShapes[0];
			// 使用类型断言来处理style属性
			const shapeWithStyle = firstShape as any;
			if (shapeWithStyle.style && shapeWithStyle.style.color) {
				currentColor = shapeWithStyle.style.color;
			}
			if (shapeWithStyle.style && shapeWithStyle.style.size) {
				currentSize = shapeWithStyle.style.size;
			}
		}
		
		if (svgObj) {
		previewUri = await svgToPngDataUri(svgObj) || svgObj.svg;
		// if(previewUri) addDataURIImage(previewUri) // NOTE: Option for testing
	}

		if(previewUri) {
			const pageData = buildWritingFileData_v1({
				tlEditorSnapshot: modifiedSnapshot,
				previewUri
			})
			// 确保meta对象存在且包含必要的属性
			if (!pageData.meta) pageData.meta = {
				pluginVersion: '',
				tldrawVersion: ''
			};
			// 添加brushStyles属性
			pageData.meta.brushStyles = {
				color: currentColor,
				size: currentSize
			}
			props.save(pageData);
			// await savePngExport(props.plugin, previewUri, props.fileRef) // REVIEW: Still need a png?

		} else {
			const pageData = buildWritingFileData_v1({
				tlEditorSnapshot: modifiedSnapshot
			})
			// 确保meta对象存在且包含必要的属性
			if (!pageData.meta) pageData.meta = {
				pluginVersion: '',
				tldrawVersion: ''
			};
			// 添加brushStyles属性
			pageData.meta.brushStyles = {
				color: currentColor,
				size: currentSize
			}
			props.save(pageData);
		}

		return;
	}

	const getTlEditor = (): Editor | undefined => {
		return tlEditorRef.current;
	};

	//////////////

	return <>
		<div
			ref = {tlEditorWrapperElRef}
			className = {classNames([
				"ddc_ink_writing-editor",
			])}
			style={{
				height: '100%',
				position: 'relative',
				opacity: 0, // So it's invisible while it loads
			}}
		>
			<TldrawUiContextProvider>
				<TldrawEditor
					options = {tlOptions_v1}
					shapeUtils = {[...defaultShapeUtils, ...MyCustomShapes_v1]}
					tools = {[...defaultTools, ...defaultShapeTools]}
					initialState = "draw"
					snapshot = {tlEditorSnapshot}
					// persistenceKey = {props.fileRef.path}

					// bindingUtils = {defaultBindingUtils}
					components = {defaultComponents}

					onMount = {handleMount}

					// Prevent autoFocussing so it can be handled in the handleMount
					autoFocus = {false}
				/>
			</TldrawUiContextProvider>
			<FingerBlocker getTlEditor={getTlEditor} wrapperRef={tlEditorWrapperElRef} />
			<PrimaryMenuBar>
                <WritingMenu
                    getTlEditor = {getTlEditor}
                    onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
                />
				{props.embedded && props.extendedMenu && (
					<ExtendedWritingMenu
						onLockClick = { async () => {
							// 保存当前状态，并确保内容在锁定后仍然可见
							const editor = getTlEditor();
							if (editor) {
								// 使用mergeRemoteChanges确保状态正确更新
								editor.store.mergeRemoteChanges(() => {
									// 保存当前状态
								});
								// 直接保存，不隐藏任何内容
								await completeSave(editor);
							}
							if(props.closeEditor) props.closeEditor();
						}}
						menuOptions = {props.extendedMenu}
					/>
				)}
			</PrimaryMenuBar>

		</div>
	</>;


	// Helper functions
	///////////////////

    async function fetchFileData() {
        const inkFileData = await getInkFileData(props.writingFile)
        if(inkFileData.tldraw) {
            const snapshot = prepareWritingSnapshot(inkFileData.tldraw as TLEditorSnapshot);
            setTlEditorSnapshot(snapshot);
        }
    }


};
