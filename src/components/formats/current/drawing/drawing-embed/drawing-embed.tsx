import "./drawing-embed.scss";
import * as React from "react";
import { useRef, useState, useEffect } from "react";
import InkPlugin from "src/main";
import { InkFileData } from "src/components/formats/current/types/file-data";
import { embedShouldActivateImmediately } from "src/logic/utils/storage";
import { getFullPageWidth } from "src/logic/utils/getFullPageWidth";
import { verbose } from "src/logic/utils/log-to-console";
import { rememberDrawingFile } from "src/logic/utils/rememberDrawingFile";
import { openInkFile } from "src/logic/utils/open-file";
import { TFile } from "obsidian";
import classNames from "classnames";
import { atom, useSetAtom, useAtomValue } from "jotai";
import { DRAWING_INITIAL_WIDTH, DRAWING_INITIAL_ASPECT_RATIO } from "src/constants";
import { DrawingEmbedPreviewWrapper } from "../drawing-embed-preview/drawing-embed-preview";
import { EmbedSettings } from "src/types/embed-settings";
import { TldrawDrawingEditorWrapper } from "../tldraw-drawing-editor/tldraw-drawing-editor";
import { TLEditorSnapshot } from 'tldraw';  // ✅ 添加导入修复找不到 TLEditorSnapshot
import { autoConvertRegularSvgToInk } from "src/logic/utils/extractInkJsonFromSvg";  // ✅ 添加导入用于解析SVG文件
import { getGlobals } from "src/stores/global-store";

// ✅ 添加全局声明修复 window.app
declare global {
  interface Window {
    app?: any;
  }
}

// ✅ 假设 InkFileData 类型已扩展或使用 any 临时修复 tlEditorSnapshot
interface ExtendedInkFileData extends InkFileData {
  tlEditorSnapshot?: TLEditorSnapshot;
}

///////
///////


export enum DrawingEmbedState {
	preview = 'preview',
	loadingEditor = 'loadingEditor',
    editor = 'editor',
    loadingPreview = 'loadingPreview',
}
export const embedStateAtom_v2 = atom(DrawingEmbedState.preview)
export const previewActiveAtom_v2 = atom<boolean>((get) => {
    const embedState = get(embedStateAtom_v2);
    // 预览流程（preview/loadingPreview）均视为激活，编辑流程（loadingEditor/editor）视为非激活
    return [DrawingEmbedState.preview, DrawingEmbedState.loadingPreview].includes(embedState);
})
export const editorActiveAtom_v2 = atom<boolean>((get) => {
    const embedState = get(embedStateAtom_v2);
    // 编辑流程（loadingEditor/editor）均视为激活，预览流程（preview/loadingPreview）视为非激活
    return [DrawingEmbedState.loadingEditor, DrawingEmbedState.editor].includes(embedState);
})

///////

export type DrawingEditorControls = {
	save: Function,
	saveAndHalt: Function,
}

interface DrawingEmbed_Props {
	embeddedFile: TFile | null,
	embedSettings: EmbedSettings,
	saveSrcFile: (pageData: InkFileData) => {},
    remove: Function,
    setEmbedProps?: (width: number, aspectRatio: number) => void,
	partialEmbedFilepath: string,
}

export function DrawingEmbed (props: DrawingEmbed_Props) {

	// 移除重复的props日志输出，避免日志重复

	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	const editorControlsRef = useRef<DrawingEditorControls>();
	const embedWidthRef = useRef<number>(props.embedSettings.embedDisplay.width || DRAWING_INITIAL_WIDTH);
	const embedAspectRatioRef = useRef<number>(props.embedSettings.embedDisplay.aspectRatio || DRAWING_INITIAL_ASPECT_RATIO);

    const setEmbedState = useSetAtom(embedStateAtom_v2);
	const editorActive = useAtomValue(editorActiveAtom_v2);

	// ✅ 加载文件快照
	const [tlEditorSnapshot, setTlEditorSnapshot] = useState<TLEditorSnapshot | undefined>(undefined);
	const [snapshotLoaded, setSnapshotLoaded] = useState(false); // ✅ 添加快照加载状态

	useEffect(() => {
		const loadSnapshot = async () => {
			if (props.embeddedFile) {
				try {
					const pageData = await refreshPageData({ app: { vault: window.app?.vault } } as any, props.embeddedFile) as ExtendedInkFileData;  // ✅ 使用扩展类型
					setTlEditorSnapshot(pageData.tlEditorSnapshot);
					setSnapshotLoaded(true); // ✅ 标记快照已加载

				} catch (error) {
					console.error('Failed to load snapshot:', error);
					setSnapshotLoaded(true); // ✅ 即使加载失败也标记为已加载，避免阻塞
				}
			} else {
				setSnapshotLoaded(true); // ✅ 如果没有文件，也标记为已加载
			}
		};
		loadSnapshot();
	}, [props.embeddedFile]);

	// On first mount
	React.useEffect( () => {
		if(embedShouldActivateImmediately()) {
			// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
			// ✅ 等待快照加载完成后再切换到编辑模式
			const waitForSnapshotAndSwitch = () => {
				if (snapshotLoaded) {
					switchToEditMode();
				} else {
					// 如果快照还未加载，等待100ms后重试
					setTimeout(waitForSnapshotAndSwitch, 100);
				}
			};
			
			setTimeout(waitForSnapshotAndSwitch, 200);
		}
		
		window.addEventListener('resize', handleResize);
		handleResize();

        return () => {
			window.removeEventListener('resize', handleResize);
		}
	}, [snapshotLoaded]) // ✅ 添加snapshotLoaded依赖

	// ✅ 处理编辑器实例准备就绪的回调
	const handleEditorInstanceReady = (editor: any): void => {

		// 不需要保存编辑器引用或处理SVG导入，这些功能已移至drawing-view.tsx
	};

	const commonExtendedOptions = [
		{
			text: 'Copy drawing',
			action: async () => {
				await rememberDrawingFile(props.embeddedFile as TFile);
			}
		},
		{
			text: 'Open drawing',
			action: async () => {
				await openInkFile(props.embeddedFile as TFile);
			}
		},
		{
			text: 'Remove embed',
			action: () => {
				props.remove()
			},
		},
	].filter(Boolean)

	// 移除重复的props日志输出，避免日志重复

	////////////

	// TODO: style this
	if (!props.embeddedFile) {
		return <>
		<div
			style = {{
				padding: '1em',
				marginBlock: '0.5em',
				color: 'red',
				backgroundColor: 'rgba(255, 0, 0, 0.1)',
				borderRadius: '0.5em',
				textAlign: 'center',
			}}
		>
			'{props.partialEmbedFilepath}' not found
		</div>
		</>
	}

	return <>
		<div
			ref = {embedContainerElRef}
			className = {classNames([
				'ddc_ink_embed',
				'ddc_ink_drawing-embed',
			])}
			style = {{
				// Must be padding as margin creates codemirror calculation issues
				paddingTop: '1em',
				paddingBottom: '0.5em',
			}}
		>
			{/* Include another container so that it's height isn't affected by the padding of the outer container */}
			<div
					className = 'ddc_ink_resize-container'
					ref = {resizeContainerElRef}
					style = {{
						width: embedWidthRef.current + 'px',
						height: embedWidthRef.current / embedAspectRatioRef.current + 'px',
						position: 'relative', // For absolute positioning inside
						left: '50%',
						translate: '-50%',
					}}
				>
				
                {!editorActive && (
                    <DrawingEmbedPreviewWrapper
                        embeddedFile = {props.embeddedFile}
                        embedSettings = {props.embedSettings}
                        onReady = {() => {}}
                        onClick = { async () => {
                            // dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
                            // 等待快照加载完成后再切换到编辑模式
                            if (snapshotLoaded) {
                                switchToEditMode();
                            } else {
                                // 如果快照还未加载，等待100ms后重试
                                const waitForSnapshotAndSwitch = () => {
                                    if (snapshotLoaded) {
                                        switchToEditMode();
                                    } else {
                                        setTimeout(waitForSnapshotAndSwitch, 100);
                                    }
                                };
                                setTimeout(waitForSnapshotAndSwitch, 100);
                            }
                        }}
                    />
                )}
                
                {editorActive && (
                    <TldrawDrawingEditorWrapper
                        key={`drawing-editor-${props.embeddedFile?.path}`} // 用文件路径作为稳定key
                        fileRef = {props.embeddedFile}
                        onReady = {() => {}}
                        drawingFile = {props.embeddedFile}
                        save = {props.saveSrcFile}
                        extendedMenu = {commonExtendedOptions}
                        embedded
                        saveControlsReference = {registerEditorControls}
                        closeEditor = {saveAndSwitchToPreviewMode}
                        resizeEmbed = {resizeEmbed}
						tlEditorSnapshot={tlEditorSnapshot} // ✅ 传递快照
                        plugin={getGlobals().plugin}
                    />
                )}

				</div>				
		</div>
	</>;

	//// Helper functions
	/////////////////////

	function registerEditorControls(handlers: DrawingEditorControls) {
		editorControlsRef.current = handlers;

	}

	function resizeEmbed(pxWidthDiff: number, pxHeightDiff: number) {
		if(!resizeContainerElRef.current) return;
		const maxWidth = getFullPageWidth(embedContainerElRef.current)
		if(!maxWidth) return;

		let destWidth = embedWidthRef.current + pxWidthDiff;
		if(destWidth < 350) destWidth = 350;
		if(destWidth > maxWidth) destWidth = maxWidth;
		
		const curHeight = resizeContainerElRef.current.getBoundingClientRect().height;
		let destHeight = curHeight + pxHeightDiff;
		if(destHeight < 150) destHeight = 150;

		embedWidthRef.current = destWidth;
		embedAspectRatioRef.current = destWidth / destHeight;
		resizeContainerElRef.current.style.width = embedWidthRef.current + 'px';
		resizeContainerElRef.current.style.height = destHeight + 'px';
		// props.setEmbedProps(embedHeightRef.current); // NOTE: Can't do this here because it causes the embed to reload
	}
	function applyEmbedHeight() {
		if(!resizeContainerElRef.current) return;
		resizeContainerElRef.current.style.width = embedWidthRef.current + 'px';
		const curWidth = resizeContainerElRef.current.getBoundingClientRect().width;
		resizeContainerElRef.current.style.height = curWidth/embedAspectRatioRef.current + 'px';
	}

	// function resetEmbedHeight() {
	// 	if(!embedContainerElRef.current) return;
	// 	const newHeight = embedContainerElRef.current?.offsetHeight;
	// 	if(newHeight) {
	// 		embedContainerElRef.current.style.height = newHeight + 'px';
	// 	} else {
	// 		embedContainerElRef.current.style.height = 'unset'; // TODO: CSS transition doesn't work between number and unset
	// 	}
	// }

	function switchToEditMode() {
		verbose('Set DrawingEmbedState: loadingEditor')
		applyEmbedHeight();
        setEmbedState(DrawingEmbedState.loadingEditor);
        // 状态转换将在TldrawDrawingEditorWrapper中自动处理
	}

    async function saveAndSwitchToPreviewMode() {
		verbose('Set DrawingEmbedState: loadingPreview');

		try {
			if(editorControlsRef.current) {

				await editorControlsRef.current.saveAndHalt();
			} else {
				console.warn('editorControls not available, skipping saveAndHalt');
			}
		} catch (error) {
			console.error('Error in saveAndHalt:', error);
		}
		
        setEmbedState(DrawingEmbedState.loadingPreview);
        if (props.setEmbedProps) {
            props.setEmbedProps(embedWidthRef.current, embedAspectRatioRef.current);
        }
	}

	function handleResize() {
		const maxWidth = getFullPageWidth(embedContainerElRef.current);
		if (resizeContainerElRef.current) {
			resizeContainerElRef.current.style.maxWidth = '100%';
			const curWidth = resizeContainerElRef.current.getBoundingClientRect().width;
			resizeContainerElRef.current.style.height = curWidth/embedAspectRatioRef.current + 'px';
		}
	};
};

export default DrawingEmbed;

async function refreshPageData(plugin: InkPlugin, file: TFile): Promise<InkFileData> {
	const v = plugin.app.vault;
	const pageDataStr = await v.read(file);
	
	// 检查文件扩展名，如果是SVG文件，使用autoConvertRegularSvgToInk解析（支持自动转换常规SVG）
	if (file.extension.toLowerCase() === 'svg') {
		return autoConvertRegularSvgToInk(pageDataStr);
	}
	
	// 对于非SVG文件，直接解析JSON
	const pageData = JSON.parse(pageDataStr) as InkFileData;
	return pageData;
}