import classNames from 'classnames';
import './drawing-embed-preview.scss';
import * as React from 'react';
import SVG from 'react-inlinesvg';
import { PrimaryMenuBar } from 'src/tldraw_v1/primary-menu-bar/primary-menu-bar';
import TransitionMenu from 'src/tldraw_v1/transition-menu/transition-menu';
import InkPlugin from 'src/main';
import { TFile } from 'obsidian';
import { useAtomValue, useSetAtom } from 'jotai';
import { DrawingEmbedState, embedStateAtom, previewActiveAtom } from '../../../tldraw_v1/drawing/drawing-embed-editor/drawing-embed';
import { debug, verbose } from 'src/utils/log-to-console';
import { getGlobals } from 'src/stores/global-store';
const emptyDrawingSvg = require('../../../placeholders/empty-drawing-embed.svg');

//////////
//////////

interface DrawingEmbedPreviewProps {
    partialPreviewFilepath: string,
    embedSettings: any,
    onReady: Function,
	onClick: React.MouseEventHandler,
}

// Wraps the component so that it can full unmount when inactive
export const DrawingEmbedPreviewWrapperNew: React.FC<DrawingEmbedPreviewProps> = (props) => {
    const previewActive = useAtomValue(previewActiveAtom);

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

    const file = plugin.app.vault.getAbstractFileByPath(props.partialPreviewFilepath);
    const filepath = file ? plugin.app.vault.adapter.getResourcePath(file.path) : '';

    React.useEffect(() => {
        verbose('PREVIEW mounted');
        return () => {
            verbose('PREVIEW unmounting');
        }
    }, [])

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
            {file && (<>
                <SVG
                    src = {filepath}
                    style = {{
                        width: '100%',
                        height: '100%',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        cursor: 'pointer'
                    }}
                    pointerEvents = "visible"
                    onLoad = {onLoad}
                    viewBox = "0 0 250 250" // TODO: This needs to be set to the actual width and height of the SVG
                />
            </>)}
            {!file && (<>
                '{props.partialPreviewFilepath}' not found
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



