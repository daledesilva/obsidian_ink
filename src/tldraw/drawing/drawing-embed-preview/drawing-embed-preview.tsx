import './drawing-embed-preview.scss';
import * as React from 'react';
import SVG from 'react-inlinesvg';
import { PrimaryMenuBar } from 'src/tldraw/primary-menu-bar/primary-menu-bar';
import TransitionMenu from 'src/tldraw/transition-menu/transition-menu';

//////////
//////////

interface DrawingEmbedProps {
    src: string,
    isActive: boolean,
	onClick: React.MouseEventHandler,
	onEditClick: React.MouseEventHandler,
	commonExtendedOptions: any[],
}

export const DrawingEmbedPreview: React.FC<DrawingEmbedProps> = (props) => {

    // Check if src is a pnd DataURI. If not, it's an SVG
    const isImg = props.src.slice(0,4) === 'data';

	return <>
        <div
            className = 'ink_drawing-embed-preview'
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
                        width: '100%'
                    }}
                />
            )}
            {!isImg && (
                <SVG
                    src = {props.src}
                    style = {{
                        width: '100%',
                        height: 'fit-content',
                        cursor: 'pointer'
                    }}
                    pointerEvents = "visible"
                />
            )}
            {/* Works for SVG, but you can't dynamically adjust css */}
            {/* <img
                onClick = {props.onClick}
                // src = {props.src}
                src={`data:image/svg+xml;utf8,${encodeURIComponent(props.src)}`}
                style = {{
                    width: '100%'
                }}
            /> */}
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