import classNames from 'classnames';
import './drawing-embed-preview.scss';
import * as React from 'react';
import SVG from 'react-inlinesvg';
import { PrimaryMenuBar } from 'src/tldraw/primary-menu-bar/primary-menu-bar';
import TransitionMenu from 'src/tldraw/transition-menu/transition-menu';
import InkPlugin from 'src/main';
import { TFile } from 'obsidian';
import { useAtomValue, useSetAtom } from 'jotai';
import { DrawingEmbedState, embedStateAtom, previewActiveAtom } from '../drawing-embed';
import { getInkFileData } from 'src/utils/getInkFileData';
const emptyDrawingSvg = require('../../../placeholders/empty-drawing-embed.svg');

//////////
//////////

interface DrawingEmbedPreviewProps {
    plugin: InkPlugin,
    onReady: Function,
    drawingFile: TFile,
	onClick: React.MouseEventHandler,
}

// Wraps the component so that it can full unmount when inactive
export const DrawingEmbedPreviewWrapper: React.FC<DrawingEmbedPreviewProps> = (props) => {
    const previewActive = useAtomValue(previewActiveAtom);
    //console.log('PREVIEW ACTIVE', previewActive)

    if (previewActive) {
        return <DrawingEmbedPreview {...props} />
    } else {
        return <></>
    }
}

export const DrawingEmbedPreview: React.FC<DrawingEmbedPreviewProps> = (props) => {
    const svgRef = React.useRef(null);

    const containerElRef = React.useRef<HTMLDivElement>(null);
    const setEmbedState = useSetAtom(embedStateAtom);
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

            // Not currently doing this cause it can mean users easily lose their undo history
            // onMouseUp = {props.onEditClick}
            // onMouseEnter = {props.onClick}
        >
            {isImg && (
                <img
                    src = {fileSrc}
                    style = {{
                        height: '100%',
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
            setEmbedState(DrawingEmbedState.preview);
            props.onReady();
        }, 100);
    }

    async function fetchFileData() {
        const inkFileData = await getInkFileData(props.plugin, props.drawingFile)
        if (inkFileData.previewUri) setFileSrc(inkFileData.previewUri)
    }

};



