import './drawing-embed-preview.scss';
import * as React from 'react';
import { PrimaryMenuBar } from 'src/tldraw/primary-menu-bar/primary-menu-bar';
import TransitionMenu from 'src/tldraw/transition-menu/transition-menu';

//////////
//////////

interface DrawingEmbedProps {
    src: string,
    isActive: boolean,
	onClick: React.MouseEventHandler,
	onEditClick: React.MouseEventHandler,
	onCopyClick: React.MouseEventHandler,
}

export const DrawingEmbedPreview: React.FC<DrawingEmbedProps> = (props) => {

	return <>
        <div
            className = 'ink_drawing-embed-preview'
            style={{
                // height: '100%',
                position: 'relative'
            }}
        >
            <img
                onClick = {props.onClick}
                src = {props.src}
                style = {{
                    width: '100%'
                }}
            />
            {props.isActive && (
                <PrimaryMenuBar>
                    <TransitionMenu
                        onEditClick = {props.onEditClick}
                        onCopyClick = {props.onCopyClick}
                    />
                </PrimaryMenuBar>
            )}
        </div>
    </>;

};