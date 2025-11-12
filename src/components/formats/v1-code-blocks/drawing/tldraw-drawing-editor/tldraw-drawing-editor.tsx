import './tldraw-drawing-editor.scss';
import { Editor, TLUiOverrides, TldrawEditor, TldrawHandles, TldrawOptions, TldrawScribble, TldrawSelectionForeground, TldrawShapeIndicators, TldrawUiContextProvider, defaultShapeTools, defaultShapeUtils, defaultTools, getSnapshot, TLEditorSnapshot, TLUnknownShape, ContextMenu, TldrawUiMenuSubmenu, TldrawUiMenuItem } from "tldraw";
import { useRef } from "react";
import { Activity, adaptTldrawToObsidianThemeMode, focusChildTldrawEditor, getActivityType, getDrawingSvg, initDrawingCamera, prepareDrawingSnapshot, preventTldrawCanvasesCausingObsidianGestures } from "src/components/formats/v1-code-blocks/utils/tldraw-helpers";
import { ResizeHandle } from 'src/components/jsx-components/resize-handle/resize-handle';
import InkPlugin from "src/main";
import * as React from "react";
import { TFile } from 'obsidian';
import { InkFileData_v1 } from 'src/components/formats/v1-code-blocks/types/file-data';
import { buildDrawingFileData_v1 } from 'src/components/formats/v1-code-blocks/utils/build-file-data';
import { DRAW_SHORT_DELAY_MS, DRAW_LONG_DELAY_MS } from 'src/constants';
import { PrimaryMenuBar } from 'src/components/jsx-components/primary-menu-bar/primary-menu-bar';
import DrawingMenu from 'src/components/jsx-components/drawing-menu/drawing-menu';
import ExtendedDrawingMenu from 'src/components/jsx-components/extended-drawing-menu/extended-drawing-menu';
import classNames from 'classnames';
import { useAtomValue, useSetAtom } from 'jotai';
import { DrawingEmbedState_v1, editorActiveAtom, embedStateAtom } from '../drawing-embed-editor/drawing-embed';
import { verbose } from 'src/logic/utils/log-to-console';
import { FingerBlocker } from 'src/components/jsx-components/finger-blocker/finger-blocker';
import { lockShape } from '../../utils/tldraw-helpers';
import { getInkFileData } from 'src/components/formats/v1-code-blocks/utils/getInkFileData';
import { svgToPngDataUri } from 'src/logic/utils/screenshots';

///////
///////

interface TldrawDrawingEditorProps_v1 {
    onReady?: Function,
	plugin: InkPlugin,
	drawingFile: TFile,
	save: (pageData: InkFileData_v1) => void,
	extendedMenu?: any[]

	// For embeds
	embedded?: boolean,
	resizeEmbed?: (pxWidthDiff: number, pxHeightDiff: number) => void,
	closeEditor?: Function,
	saveControlsReference?: Function,
}

// Wraps the component so that it can full unmount when inactive
export const TldrawDrawingEditorWrapper_v1: React.FC<TldrawDrawingEditorProps_v1> = (props) => {
    const editorActive = useAtomValue(editorActiveAtom);
    const editorWrapperRefEl = React.useRef<HTMLDivElement>(null);

    const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
        // 只有在编辑模式下才处理右键菜单事件
        if (editorActive) {
            console.log('TldrawDrawingEditorWrapper_v1: 编辑模式下处理右键菜单事件');
            
            // 尝试获取tldraw画布元素
            try {
                // 在当前容器中查找画布
                let canvas = editorWrapperRefEl.current?.querySelector('.tl-canvas');
                
                if (canvas) {
                    console.log('TldrawDrawingEditorWrapper_v1: 找到画布，让tldraw处理右键菜单');
                    // 阻止浏览器默认右键菜单
                    e.preventDefault();
                    // 不阻止事件冒泡，让tldraw内部处理
                } else {
                    console.log('TldrawDrawingEditorWrapper_v1: 未找到画布元素，允许默认右键菜单行为');
                }
            } catch (error) {
                console.log('TldrawDrawingEditorWrapper_v1: 处理事件时出错:', error);
                // 出错时也允许默认行为
            }
        }
    }

    if(editorActive) {
        return (
            <div 
                ref={editorWrapperRefEl}
                onContextMenu={handleContextMenu}
                style={{ width: '100%', height: '100%' }}
            >
                <TldrawDrawingEditor_v1 {...props} />
            </div>
        )
    } else {
        return <></>
    }
}

// tldraw配置选项
const tlOptions_v1: Partial<TldrawOptions> = {
	defaultSvgPadding: 10 // Slight amount to prevent cropping overflows from stroke thickness
};



export function TldrawDrawingEditor_v1(props: TldrawDrawingEditorProps_v1) {

	const [tlEditorSnapshot, setTlEditorSnapshot] = React.useState<TLEditorSnapshot>();
	const setEmbedState = useSetAtom(embedStateAtom);
	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const tlEditorRef = useRef<Editor>();
	const editorWrapperRefEl = useRef<HTMLDivElement>(null);
	const removeUserActionListenerRef = useRef<() => void>();
	
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

	// 清除定时器和移除用户动作监听器
	const unmountActions = () => {
		// 防止在打开新文件时postProcessTimer完成并覆盖新文件的数据
		resetInputPostProcessTimers();
		if (removeUserActionListenerRef.current) {
			removeUserActionListenerRef.current();
		}
	}

	if(!tlEditorSnapshot) return <></>
	//verbose('EDITOR snapshot loaded')

	// 定义默认组件映射，确保基础组件被正确配置
	const defaultComponents = {
		Scribble: TldrawScribble,
		ShapeIndicators: TldrawShapeIndicators,
		CollaboratorScribble: TldrawScribble,
		SelectionForeground: TldrawSelectionForeground,
		Handles: TldrawHandles
	};

	// 配置UI覆盖以启用右键菜单 - tldraw v4.0.3版本兼容
	const uiOverrides = {
		// 使用自定义上下文菜单，包含子菜单功能
		ContextMenu: (props: any) => {
			return (
				<div style={{ zIndex: 5000, position: 'fixed' }}>
					<CustomContextMenu onClose={props.onClose} />
				</div>
			);
		},
		
		// 确保画布菜单(空白处右键菜单)正确显示
		CanvasMenu: (props: any) => {
			return (
				<div style={{ zIndex: 5000, position: 'fixed' }}>
					<props.Component {...props}>
						{props.children}
					</props.Component>
				</div>
			);
		},
		
		// 确保形状菜单(选中元素后右键菜单)正确显示
		ShapeMenu: (props: any) => {
			return (
				<div style={{ zIndex: 5000, position: 'fixed' }}>
					<props.Component {...props}>
						{props.children}
					</props.Component>
				</div>
			);
		},
		
		// 添加Menu容器覆盖，确保菜单z-index足够高
		Menu: (props: any) => {
			return (
				<div style={{ zIndex: 5000, position: 'fixed' }}>
					<props.Component {...props}>
						{props.children}
					</props.Component>
				</div>
			);
		}
	};

	const handleMount = (_editor: Editor) => {
		const editor = tlEditorRef.current = _editor;
		setEmbedState(DrawingEmbedState_v1.editor);
		focusChildTldrawEditor(editorWrapperRefEl.current);
		preventTldrawCanvasesCausingObsidianGestures(editor);

		// 设置默认笔刷颜色和大小
		if (editor.styleProps && editor.styleProps.geo) {
		  // 找到 color 的样式属性对象
		  for (const [key, value] of editor.styleProps.geo.entries()) {
			if (value === "color") {
			  key.defaultValue = "light-blue"; // 默认颜色
			} else if (value === "size") {
			  key.defaultValue = "m"; // 默认大小
			}
		  }
		}

		// tldraw content setup
		adaptTldrawToObsidianThemeMode(editor);
		editor.updateInstanceState({
			isGridMode: true,
		})
		
		// 为tldraw v4.0.3版本启用右键菜单功能
		console.log('TldrawDrawingEditor_v1: 尝试启用右键菜单');
		try {
			// 获取画布容器
			const canvas = editor.getContainer().querySelector('.tl-canvas') as HTMLDivElement;
			if (canvas) {
				// 确保右键菜单事件能够正常触发
				canvas.style.pointerEvents = 'auto';
				
				// tldraw菜单功能已通过UI组件覆盖实现
			}
		} catch (error) {
			console.log('TldrawDrawingEditor_v1: 启用右键菜单时出错:', error);
		}
		// view setup
		initDrawingCamera(editor);
		if (props.embedded) {
			// 移除嵌入式模式下的相机锁定，允许iOS设备上的缩放功能
			// editor.setCameraOptions({
			//		isLocked: true,
			// })
		}

		// 隐藏收费按钮
		const licenseButton = editor.getContainer().querySelector('.tl-watermark_SEE-LICENSE[data-unlicensed="true"] > button');
		if (licenseButton) {
			(licenseButton as HTMLElement).style.display = 'none';
		}


		// Make visible once prepared
		if(editorWrapperRefEl.current) {
			editorWrapperRefEl.current.style.opacity = '1';
		}

		// Runs on any USER caused change to the store, (Anything wrapped in silently change method doesn't call this).
		// 存储removeUserActionListener到ref中，以便在组件卸载时可以访问
		removeUserActionListenerRef.current = editor.store.listen((entry) => {

			const activity = getActivityType(entry);
			switch (activity) {
				case Activity.PointerMoved:
					// REVIEW: Consider whether things are being erased
					break;

				case Activity.CameraMovedAutomatically:
				case Activity.CameraMovedManually:
					break;

				case Activity.DrawingStarted:
					resetInputPostProcessTimers();
					break;
				case Activity.DrawingContinued:
					resetInputPostProcessTimers();
					break;
				case Activity.DrawingCompleted:
					queueOrRunStorePostProcesses(editor);
					break;
				case Activity.DrawingErased:
					queueOrRunStorePostProcesses(editor);
					break;

				default:
					// This is the catch all for actions like Undo, Redo, Paste etc.
					queueOrRunStorePostProcesses(editor);
					break;
			}

		});


		// For when the editor is a child of this component
		if (props.onReady) {
			props.onReady();
		}

		// 提供保存控制接口
		if(props.saveControlsReference) {
			props.saveControlsReference({
				save: () => saveFile(editor),
				saveAndHalt: async (): Promise<void> => {
					await saveFile(editor);
					unmountActions();	// 立即清理，确保在completeSave和未来卸载之间不会发生其他事情
				}
			})
		}

		return () => {
			unmountActions();
		};
	}

	// For when changes to the store happen
	const queueOrRunStorePostProcesses = (editor: Editor) => {
		// Clear any existing timers
		if(shortDelayPostProcessTimeoutRef.current) {
			clearTimeout(shortDelayPostProcessTimeoutRef.current);
		}
		if(longDelayPostProcessTimeoutRef.current) {
			clearTimeout(longDelayPostProcessTimeoutRef.current);
		}

		// Queue up actions that need to happen after the user stops interacting
		// for a short period of time
		shortDelayPostProcessTimeoutRef.current = setTimeout(() => {
			shortDelayPostProcesses(editor)
		}, DRAW_SHORT_DELAY_MS)

		// Queue up actions that need to happen after the user stops interacting
		// for a long period of time
		longDelayPostProcessTimeoutRef.current = setTimeout(() => {
			longDelayPostProcesses(editor)
		}, DRAW_LONG_DELAY_MS)
	}

	// Short delay actions
	const shortDelayPostProcesses = (editor: Editor) => {
		if(editor) {
			// console.log('Running short delay post processes');
			// resizeEmbedIfNeeded(editor)
		}
	}

	// Long delay actions
	const longDelayPostProcesses = (editor: Editor) => {
		if(editor) {
			// console.log('Running long delay post processes');
			saveFile(editor)
		}
	}

	const resetInputPostProcessTimers = () => {
		if(shortDelayPostProcessTimeoutRef.current) {
			clearTimeout(shortDelayPostProcessTimeoutRef.current);
		}
		if(longDelayPostProcessTimeoutRef.current) {
			clearTimeout(longDelayPostProcessTimeoutRef.current);
		}
	}

	const saveFile = async (editor: Editor) => {
		// @ts-ignore - Get snapshot from editor store
		const snapshot = getSnapshot(editor.store);
        
		// 确保所有writing-container形状的meta属性是JSON可序列化的
		const modifiedSnapshot = JSON.parse(JSON.stringify(snapshot));
        
		// 检查并修复document.store中的所有shape记录
		if (modifiedSnapshot.document && modifiedSnapshot.document.store) {
			Object.values(modifiedSnapshot.document.store).forEach((record: any) => {
				if (record.typeName === 'shape' && record.type === 'writing-container' && record.meta === undefined) {
					record.meta = {};
				}
			});
		}
        
		// 生成预览图像 - 使用PNG格式确保透明背景
		let previewUri: string | undefined;
		try {
			const svgObj = await getDrawingSvg(editor);
			if (svgObj && svgObj.svg) {
				// 使用项目中已有的svgToPngDataUri函数将SVG转换为带透明背景的PNG
				const pngSvgObj = {
					svg: svgObj.svg,
					width: svgObj.width,
					height: svgObj.height
				};
				previewUri = await svgToPngDataUri(pngSvgObj) || undefined; // 将null转换为undefined以匹配类型
			}
		} catch (error) {
			console.error('Error generating preview URI:', error);
		}
        
		const fileData = buildDrawingFileData_v1({ 
			tlEditorSnapshot: modifiedSnapshot, 
			previewUri 
		});
		props.save(fileData);
	}

	const getTlEditor = (): Editor | undefined => {
		return tlEditorRef.current;
	};

	const customExtendedMenu = [
		{
			text: 'Grid on/off',
			action: () => {
				const editor = getTlEditor();
				if(editor) {
					editor.updateInstanceState({ isGridMode: !editor.getInstanceState().isGridMode })
				}
			}
		},
		...(props.extendedMenu || []),
	]

	//////////////

	return <>
		<div
			ref = {editorWrapperRefEl}
			className = {classNames([
				"ddc_ink_drawing-editor"
			])}
			style = {{
				height: '100%',
				position: 'relative',
				opacity: 0, // So it's invisible while it loads
			}}
			onContextMenu={(e) => {
					// 只在第一次触发时处理，避免循环
					if (e.detail !== 999) {
						// 尝试获取tldraw画布元素
						try {
							// 首先尝试直接在当前容器中查找画布
							let canvas = editorWrapperRefEl.current?.querySelector('.tl-canvas');
							 
							if (canvas) {
								// 阻止浏览器默认右键菜单
								e.preventDefault();
								// 阻止事件冒泡，防止触发父组件的事件处理
								e.stopPropagation();
							 
								// 为tldraw v4版本创建并触发自定义右键菜单事件
								if (tlEditorRef.current) {
									const forwardedEvent = new MouseEvent('contextmenu', {
										clientX: e.clientX,
										clientY: e.clientY,
										bubbles: true,
										composed: true,
										view: window,
										detail: 999 // 标记为已处理的事件
									});
									canvas.dispatchEvent(forwardedEvent);
								}
							}
						} catch (error) {
							console.error('TldrawDrawingEditor_v1: 处理右键菜单时出错:', error);
						}
					}
				}}
		>
			<TldrawUiContextProvider>
				<TldrawEditor
					options = {tlOptions_v1}
					shapeUtils = {[...defaultShapeUtils]}
					tools = {[...defaultTools, ...defaultShapeTools]}
					initialState = "draw"
					snapshot = {tlEditorSnapshot}
					// persistenceKey = {props.fileRef.path}

					// bindingUtils = {defaultBindingUtils}
					components = {{...defaultComponents, ...uiOverrides}}

					onMount = {handleMount}

					// Prevent autoFocussing so it can be handled in the handleMount
					autoFocus = {false}
				/>
			</TldrawUiContextProvider>
			<FingerBlocker
				getTlEditor={getTlEditor}
				wrapperRef={editorWrapperRefEl}
			/>
			
			<PrimaryMenuBar>
				<DrawingMenu
					getTlEditor = {getTlEditor}
					onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses(tlEditor)}
				/>
				{props.embedded && (
					<ExtendedDrawingMenu
						onLockClick = { async () => {
							// 保存当前状态，并确保内容在锁定后仍然可见
							const editor = getTlEditor();
							if (editor) {
								// 锁定所有可绘制的形状
								const shapes = editor.getCurrentPageShapes() as TLUnknownShape[];
								shapes.forEach(shape => lockShape(editor, shape));
								// 保存锁定后的状态
								await saveFile(editor);
							}
							if(props.closeEditor) props.closeEditor();
						}}
						menuOptions = {customExtendedMenu}
					/>
				)}
			</PrimaryMenuBar>

			{props.resizeEmbed && (
				<ResizeHandle
					resizeEmbed = {resizeEmbed}
				/>
			)}
		</div>
	</>;

	// Helper functions
	///////////////////

    async function fetchFileData() {
        const inkFileData = await getInkFileData(props.drawingFile)
        if(inkFileData.tldraw) {
            const snapshot = prepareDrawingSnapshot(inkFileData.tldraw as TLEditorSnapshot);
            setTlEditorSnapshot(snapshot);
        }
    }

	function resizeEmbed(pxWidthDiff: number, pxHeightDiff: number) {
		if(!props.resizeEmbed) return;
		props.resizeEmbed(pxWidthDiff, pxHeightDiff);
	}

	// ResizeHandle组件已从外部导入


}

// CustomContextMenu组件 - 使用tldraw 4.0.3版本的TldrawUiMenuSubmenu和TldrawUiMenuItem组件
const CustomContextMenu: React.FC<{
	onClose?: () => void;
}> = ({ onClose }) => {
	return (
		<ContextMenu>
			{/* 复制为 - 悬停显示子菜单 */}
			<TldrawUiMenuSubmenu
				label="复制为"
				id="copy-as"
			>
				<TldrawUiMenuItem
					id="copy-svg"
					label="SVG"
					onSelect={() => {
						// 复制为 SVG 的逻辑
						console.log('复制为 SVG')
					}}
				/>
				<TldrawUiMenuItem
					id="copy-png"
					label="PNG"
					onSelect={() => {
						// 复制为 PNG 的逻辑
						console.log('复制为 PNG')
					}}
				/>
				<TldrawUiMenuItem
					id="copy-transparent"
					label="透明"
					onSelect={() => {
						// 透明背景的逻辑
						console.log('透明背景')
					}}
				/>
			</TldrawUiMenuSubmenu>
			
			{/* 导出为 - 悬停显示子菜单 */}
			<TldrawUiMenuSubmenu
				label="导出为"
				id="export-as"
			>
				<TldrawUiMenuItem
					id="export-svg"
					label="SVG"
					onSelect={() => {
						// 导出为 SVG 的逻辑
						console.log('导出为 SVG')
					}}
				/>
				<TldrawUiMenuItem
					id="export-png"
					label="PNG"
					onSelect={() => {
						// 导出为 PNG 的逻辑
						console.log('导出为 PNG')
					}}
				/>
				<TldrawUiMenuItem
					id="export-transparent"
					label="透明"
					onSelect={() => {
						// 透明背景导出的逻辑
						console.log('透明背景导出')
					}}
				/>
			</TldrawUiMenuSubmenu>
		</ContextMenu>
	);
};
