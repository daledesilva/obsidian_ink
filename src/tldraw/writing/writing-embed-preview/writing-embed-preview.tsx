import './writing-embed-preview.scss';
import * as React from 'react';
import SVG from 'react-inlinesvg';
import { PrimaryMenuBar } from 'src/tldraw/primary-menu-bar/primary-menu-bar';
import TransitionMenu from 'src/tldraw/transition-menu/transition-menu';

//////////
//////////

interface WritingEmbedProps {
    onReady: Function,
    src: string,
    isActive: boolean,
	onClick: React.MouseEventHandler,
	onEditClick: React.MouseEventHandler,
	commonExtendedOptions: any[],
}

export const WritingEmbedPreview: React.FC<WritingEmbedProps> = (props) => {
    const svgRef = React.useRef(null);

    // Check if src is a pnd DataURI. If not, it's an SVG
    const isImg = props.src.slice(0,4) === 'data';

	return <>
        <div
            ref = {svgRef}
            className = 'ink_writing-embed-preview'
            style={{
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
                        height: 'unset',
                        cursor: 'pointer'
                    }}
                    pointerEvents = "visible"
                    onLoad = {props.onReady}
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