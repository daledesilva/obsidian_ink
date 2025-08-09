import classNames from 'classnames';
import './drawing-embed-preview.scss';
import * as React from 'react';
// @ts-ignore
import SVG from 'react-inlinesvg';
import { TFile } from 'obsidian';
import { useAtomValue, useSetAtom } from 'jotai';
import { DrawingEmbedState_v2, embedStateAtom_v2, previewActiveAtom_v2 } from 'src/components/formats/tldraw_v2/drawing/drawing-embed/drawing-embed';
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
export const DrawingEmbedPreviewWrapper_v2: React.FC<DrawingEmbedPreviewProps> = (props) => {
    const previewActive = useAtomValue(previewActiveAtom_v2);

    console.log('props', props);

    if (previewActive) {
        return <DrawingEmbedPreview_v2 {...props} />
    } else {
        return <></>
    }
}

export const DrawingEmbedPreview_v2: React.FC<DrawingEmbedPreviewProps> = (props) => {
    const {plugin} = getGlobals();

    const containerElRef = React.useRef<HTMLDivElement>(null);
    const setEmbedState = useSetAtom(embedStateAtom_v2);

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
            setEmbedState(DrawingEmbedState_v2.preview);
            props.onReady();
        }, 100);
    }

};



