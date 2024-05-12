import classNames from 'classnames';
import './drawing-embed-preview.scss';
import * as React from 'react';
import SVG from 'react-inlinesvg';
import { PrimaryMenuBar } from 'src/tldraw/primary-menu-bar/primary-menu-bar';
import TransitionMenu from 'src/tldraw/transition-menu/transition-menu';
import InkPlugin from 'src/main';

//////////
//////////

interface DrawingEmbedProps {
    plugin: InkPlugin,
    onReady: Function,
    src: string,
    isActive: boolean,
	onClick: React.MouseEventHandler,
	onEditClick: React.MouseEventHandler,
	commonExtendedOptions: any[],
}

export const DrawingEmbedPreview: React.FC<DrawingEmbedProps> = (props) => {
    const svgRef = React.useRef(null);

    // Check if src is a pnd DataURI. If not, it's an SVG
    const isImg = props.src.slice(0,4) === 'data';

	return <>
        <div
            ref = {svgRef}
            className = {classNames([
                'ddc_ink_drawing-embed-preview',
                props.plugin.settings.drawingFrameWhenLocked && 'ddc_ink_visible-frame',
                props.plugin.settings.drawingBackgroundWhenLocked && 'ddc_ink_visible-background',
            ])}
            style={{
                // height: '100%',
                position: 'relative'
            }}
            onClick = {props.onClick}

            // Not currently doing this cause it can mean users easily lose their undo history
            // onMouseUp = {props.onEditClick}
            // onMouseEnter = {props.onClick}
        >
            {isImg && (
                <img
                    src = {props.src}
                    style = {{
                        width: '100%',
                        cursor: 'pointer',
                        pointerEvents: 'all',
                    }}
                    onLoad = {() => props.onReady()}
                />
            )}

            {!isImg && (
                <SVG
                    src = {props.src}
                    style = {{
                        width: '100%',
                        height: 'unset',
                        cursor: 'pointer'
                    }}
                    pointerEvents = "visible"
                    onLoad = {() => props.onReady()}
                />
            )}

            {props.isActive && (
                <PrimaryMenuBar>
                    <TransitionMenu
                        onEditClick = {props.onEditClick}
                        menuOptions = {props.commonExtendedOptions}
                    />
                </PrimaryMenuBar>
            )}
        </div>
    </>;

};



