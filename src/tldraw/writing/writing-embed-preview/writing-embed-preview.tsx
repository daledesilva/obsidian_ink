import './writing-embed-preview.scss';
import * as React from 'react';
import { PrimaryMenuBar } from 'src/tldraw/primary-menu-bar/primary-menu-bar';
import TransitionMenu from 'src/tldraw/transition-menu/transition-menu';

//////////
//////////

interface WritingEmbedProps {
    src: string,
    isActive: boolean,
	onClick: React.MouseEventHandler,
	onEditClick: React.MouseEventHandler,
	commonExtendedOptions: any[],
}

export const WritingEmbedPreview: React.FC<WritingEmbedProps> = (props) => {

	return <>
        <div
            className = 'ink_writing-embed-preview'
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
                        menuOptions = {props.commonExtendedOptions}
                    />
                </PrimaryMenuBar>
            )}
        </div>
    </>;

};