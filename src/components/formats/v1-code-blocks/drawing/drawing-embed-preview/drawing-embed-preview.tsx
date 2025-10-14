import './drawing-embed-preview.scss';
import * as React from 'react';
import SVG from 'react-inlinesvg';
import InkPlugin from 'src/main';
import { TFile } from 'obsidian';
import { useAtomValue, useSetAtom } from 'jotai';
import { DrawingEmbedState_v1, embedStateAtom, previewActiveAtom } from '../drawing-embed-editor/drawing-embed';
import { getInkFileData } from 'src/components/formats/v1-code-blocks/utils/getInkFileData';
import classNames from 'classnames';
const emptyDrawingSvg = require('src/defaults/empty-drawing-embed.svg');

//////////
//////////

interface DrawingEmbedPreviewProps_v1 {
    plugin: InkPlugin,
    onReady: Function,
    drawingFile: TFile,
	onClick: React.MouseEventHandler,
}

// Wraps the component so that it can full unmount when inactive
export const DrawingEmbedPreviewWrapper_v1: React.FC<DrawingEmbedPreviewProps_v1> = (props) => {
    const previewActive = useAtomValue(previewActiveAtom);
    //console.log('PREVIEW ACTIVE', previewActive)

    if (previewActive) {
        return <DrawingEmbedPreview_v1 {...props} />
    } else {
        return <></>
    }
}

export const DrawingEmbedPreview_v1: React.FC<DrawingEmbedPreviewProps_v1> = (props) => {
    const svgRef = React.useRef(null);

    const containerElRef = React.useRef<HTMLDivElement>(null);
    const setEmbedState = useSetAtom(embedStateAtom);
    const embedState = useAtomValue(embedStateAtom);
    const [fileSrc, setFileSrc] = React.useState<string>(emptyDrawingSvg);

    React.useEffect(() => {
        //console.log('PREVIEW mounted');
        fetchFileData();
        return () => {
            //console.log('PREVIEW unmounting');
        }
    })

    // Check if src is a DataURI. If not, it's an SVG
    const isImg = fileSrc.slice(0, 4) === 'data';

	return <>
        <div
            ref = {containerElRef}
            className = {classNames([
                'ddc_ink_drawing-embed-preview',
                props.plugin.settings.drawingFrameWhenLocked && 'ddc_ink_visible-frame',
                props.plugin.settings.drawingBackgroundWhenLocked && 'ddc_ink_visible-background',
            ])}
            style = {{
                position: 'absolute',
                width: '100%',
                height: '100%',
                pointerEvents: 'all',
            }}
            onClick = {props.onClick}
            
            onContextMenu = {(e) => {
                    // 阻止浏览器默认右键菜单
                    e.preventDefault();
                    // 阻止事件冒泡
                    e.stopPropagation();
                    
                    // 只有在预览模式下才处理右键菜单事件
                    if (embedState === DrawingEmbedState_v1.preview) {
                        // 在预览模式下，如果用户右键点击，我们可以切换到编辑模式
                        // 这样用户就可以在编辑模式下使用完整的右键菜单功能
                        props.onClick(e);
                    }
                }}

            // Not currently doing this cause it can mean users easily lose their undo history
            // onMouseUp = {props.onEditClick}
            // onMouseEnter = {props.onClick}
        >
            {isImg && (
                <img
                    src = {fileSrc}
                    style = {{
                        maxHeight: '100%',
                        maxWidth: '100%',
                        objectFit: 'contain',
                        cursor: 'pointer',
                        pointerEvents: 'all',
                    }}
                    onLoad = {onLoad}
                />
            )}

            {!isImg && (
                <SVG
                    src = {fileSrc}
                    style = {{
                        // width: 'auto',
                        // height: '100%',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        cursor: 'pointer'
                    }}
                    pointerEvents = "visible"
                    onLoad = {onLoad}
                />
            )}
        </div>
    </>;

    // Helper functions
    ///////////////////

    function onLoad() {
        // Slight delay on transition because otherwise a flicker is sometimes seen
        setTimeout(() => {
            //console.log('--------------- SET EMBED STATE TO preview')
            setEmbedState(DrawingEmbedState_v1.preview);
            props.onReady();
        }, 100);
    }

    async function fetchFileData() {
        const inkFileData = await getInkFileData(props.drawingFile)
        if (inkFileData.previewUri) setFileSrc(inkFileData.previewUri)
    }

    // 配置UI覆盖以启用右键菜单
    const uiOverrides = {
        // 确保上下文菜单(右键菜单)保持默认行为
        ContextMenu: (props: any) => {
            return <props.Component {...props} />;
        },
        // 确保画布菜单(空白处右键菜单)保持默认行为
        CanvasMenu: (props: any) => {
            return <props.Component {...props} />;
        },
        // 确保形状菜单(选中元素后右键菜单)保持默认行为
        ShapeMenu: (props: any) => {
            return <props.Component {...props} />;
        }
    };

};



