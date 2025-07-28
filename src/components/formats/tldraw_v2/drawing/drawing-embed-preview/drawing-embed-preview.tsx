import classNames from 'classnames';
import './drawing-embed-preview.scss';
import * as React from 'react';
import SVG from 'react-inlinesvg';
import { TFile } from 'obsidian';
import { useAtomValue, useSetAtom } from 'jotai';
import { DrawingEmbedState, embedStateAtom, previewActiveAtom } from 'src/components/formats/tldraw_v1/drawing/drawing-embed-editor/drawing-embed';
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
export const DrawingEmbedPreviewWrapperNew: React.FC<DrawingEmbedPreviewProps> = (props) => {
    const previewActive = useAtomValue(previewActiveAtom);

    console.log('props', props);

    if (previewActive) {
        return <DrawingEmbedPreviewNew {...props} />
    } else {
        return <></>
    }
}

export const DrawingEmbedPreviewNew: React.FC<DrawingEmbedPreviewProps> = (props) => {
    const {plugin} = getGlobals();
    const svgRef = React.useRef(null);

    const containerElRef = React.useRef<HTMLDivElement>(null);
    const setEmbedState = useSetAtom(embedStateAtom);

    let embeddedFilepath: undefined | string;
    if(props.embeddedFile) {
        embeddedFilepath = plugin.app.vault.getResourcePath(props.embeddedFile);
    };

    React.useEffect(() => {
        verbose('PREVIEW mounted');
        return () => {
            verbose('PREVIEW unmounting');
        }
    }, [])

    // viewBox: {
    //     x: 0,
    //     y: 0,
    //     width: 500,
    //     height: 281,
    // },

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
            }}
            onClick = {props.onClick}

            // Not currently doing this cause it can mean users easily lose their undo history
            // onMouseUp = {props.onEditClick}
            // onMouseEnter = {props.onClick}
        >
            {embeddedFilepath && (<>
                <SVG
                    src = {embeddedFilepath}
                    style = {{
                        width: '100%',
                        height: '100%',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        cursor: 'pointer'
                    }}
                    pointerEvents = "visible"
                    onLoad = {onLoad}
                    viewBox = {`${props.embedSettings.viewBox.x} ${props.embedSettings.viewBox.y} ${props.embedSettings.viewBox.width} ${props.embedSettings.viewBox.height}`}
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

};



