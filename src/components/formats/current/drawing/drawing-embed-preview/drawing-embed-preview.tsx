import classNames from 'classnames';
import './drawing-embed-preview.scss';
import * as React from 'react';
// @ts-ignore
import SVG from 'react-inlinesvg';
import { TFile } from 'obsidian';
import { useAtomValue, useSetAtom } from 'jotai';
import { DrawingEmbedState, embedStateAtom_v2, previewActiveAtom_v2 } from 'src/components/formats/current/drawing/drawing-embed/drawing-embed';
import { verbose } from 'src/logic/utils/log-to-console';
import { getGlobals } from 'src/stores/global-store';
const emptyDrawingSvg = require('src/defaults/empty-drawing-embed.svg');

//////////
//////////

interface DrawingEmbedPreviewProps {
    embeddedFile: TFile | null,
    embedSettings: any,
    onReady: Function,
	onClick: React.MouseEventHandler,
}

// Wraps the component so that it can full unmount when inactive
export const DrawingEmbedPreviewWrapper: React.FC<DrawingEmbedPreviewProps & { style?: React.CSSProperties }> = (props) => {
    const previewActive = useAtomValue(previewActiveAtom_v2);

    // 移除重复的props日志输出，避免日志重复

    // 使用CSS显示/隐藏而不是条件渲染，避免组件卸载导致的cleanup调用
    return (
        <div style={props.style}>
            <DrawingEmbedPreview {...props} />
        </div>
    );
}

export const DrawingEmbedPreview: React.FC<DrawingEmbedPreviewProps> = (props) => {
    const {plugin} = getGlobals();

    const containerElRef = React.useRef<HTMLDivElement>(null);
    const setEmbedState = useSetAtom(embedStateAtom_v2);
    const [fileSrc, setFileSrc] = React.useState<string | null>(null);

    React.useEffect(() => {
        verbose('PREVIEW mounted');
        refreshSrc();

        // Listen for file modifications to refresh preview when the embedded file changes
        // This enables refreshing when returning from edit mode, but also refreshes based off editing the same file in another embed.
        const onModify = (modifiedFile: TFile) => {
            if (!props.embeddedFile) return;
            if (modifiedFile.path !== props.embeddedFile.path) return;
            refreshSrc();
        };
        const eventRef = plugin.app.vault.on('modify', onModify);
        return () => {
            verbose('PREVIEW unmounting');
            // Clean up event listener on unmount
            // @ts-ignore - offref exists in Obsidian API
            plugin.app.vault.offref(eventRef);
        }
        // Re-run if the embedded file changes
    }, [props.embeddedFile])

	return <>
        <div
            ref = {containerElRef}
            className = {classNames([
                'ddc_ink_drawing-embed-preview',
                plugin.settings.drawingFrameWhenLocked && 'ddc_ink_visible-frame',
                plugin.settings.drawingBackgroundWhenLocked && 'ddc_ink_visible-background',
            ])}
            style = {{
                position: 'absolute',
                width: '100%',
                height: '100%',
                pointerEvents: 'all',
                backgroundColor: 'transparent'
            }}
            onClick = {props.onClick}

            // Not currently doing this cause it can mean users easily lose their undo history
            // onMouseUp = {props.onEditClick}
            // onMouseEnter = {props.onClick}
        >
            {fileSrc && (<>
                <SVG
                    src = {fileSrc}
                    style = {{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        cursor: 'pointer'
                    }}
                    pointerEvents = "visible"
                    cacheRequests = {false}
                    key = {fileSrc}
                    onLoad = {onLoad}
                    // viewBox = {`${props.embedSettings.viewBox.x} ${props.embedSettings.viewBox.y} ${props.embedSettings.viewBox.width} ${props.embedSettings.viewBox.height}`}
                />
            </>)}
        </div>
    </>;

    // Helper functions
    ///////////////////

    function onLoad() {
        // Slight delay on transition because otherwise a flicker is sometimes seen
        setTimeout(() => {
            // 只有在当前状态不是editor或loadingEditor时才设置为preview状态
            // 避免与状态转换逻辑冲突
            // 这里我们假设如果用户已经点击进入编辑模式，就不应该再设置preview状态
            // 直接调用props.onReady()而不设置状态
            props.onReady();
        }, 100);
    }

    function refreshSrc() {
        if (!props.embeddedFile) {
            setFileSrc(null);
            return;
        }
        const basePath = plugin.app.vault.getResourcePath(props.embeddedFile);
        if (!basePath) {
            setFileSrc(null);
            return;
        }
        const mtime = props.embeddedFile.stat.mtime;
        const separator = basePath.includes('?') ? '&' : '?';
        setFileSrc(`${basePath}${separator}t=${mtime}`);
    }

};



