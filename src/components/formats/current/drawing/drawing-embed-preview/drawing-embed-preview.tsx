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
export const DrawingEmbedPreviewWrapper: React.FC<DrawingEmbedPreviewProps> = (props) => {
    const previewActive = useAtomValue(previewActiveAtom_v2);

    console.log('props', props);

    if (previewActive) {
        return <DrawingEmbedPreview {...props} />
    } else {
        return <></>
    }
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
            setEmbedState(DrawingEmbedState.preview);
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



