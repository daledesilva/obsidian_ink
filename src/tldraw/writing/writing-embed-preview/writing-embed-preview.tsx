import classNames from 'classnames';
import './writing-embed-preview.scss';
import * as React from 'react';
import SVG from 'react-inlinesvg';
import { PrimaryMenuBar } from 'src/tldraw/primary-menu-bar/primary-menu-bar';
import TransitionMenu from 'src/tldraw/transition-menu/transition-menu';
import InkPlugin from 'src/main';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { EmbedState, embedStateAtom, previewActiveAtom } from '../writing-embed';
import { TFile } from 'obsidian';

//////////
//////////

interface WritingEmbedPreviewProps {
    plugin: InkPlugin,
    onResize: Function,
    src: string,
	onClick: React.MouseEventHandler,
}

// Wraps the component so that it can full unmount when inactive
export const WritingEmbedPreviewWrapper: React.FC<WritingEmbedPreviewProps> = (props) => {
    const previewActive = useAtomValue(previewActiveAtom);
    console.log('PREVIEW ACTIVE', previewActive)

    if(previewActive) {
        return <WritingEmbedPreview {...props} />
    } else {
        return <></>
    }
}

const WritingEmbedPreview: React.FC<WritingEmbedPreviewProps> = (props) => {
    const containerElRef = React.useRef<HTMLDivElement>(null);
	const setEmbedState = useSetAtom(embedStateAtom);

    // Check if src is a DataURI. If not, it's an SVG
    const isImg = props.src.slice(0,4) === 'data';

    // const handleImageLoad = () => {
    //     this.setState({ loaded: true });
    // }

    React.useEffect( () => {
        console.log('PREVIEW mounted');
        return () => {
            console.log('PREVIEW unmounting');
        }
    })
    console.log('PREVIEW rendering');


	return <>
        <div
            ref = {containerElRef}
            className = {classNames([
                'ddc_ink_writing-embed-preview',
                props.plugin.settings.writingLinesWhenLocked && 'ddc_ink_visible-lines',
                props.plugin.settings.writingBackgroundWhenLocked && 'ddc_ink_visible-background',
            ])}
            style={{
                position: 'absolute',
                width: '100%',
            }}
            onClick = {props.onClick}

            // Not currently doing this cause it can mean users easily lose their undo history
            // onMouseUp = {props.onEditClick}
            // onMouseEnter = {props.onClick}
        >
            {isImg && (<>
                <img
                    src = {props.src}
                    style = {{
                        width: '100%',
                        cursor: 'pointer',
                        pointerEvents: 'all',
                    }}
                    onLoad = {onLoad}
                />
            </>)}
            
            {!isImg && (<>
                <SVG
                    src = {props.src}
                    style = {{
                        width: '100%',
                        height: 'unset',
                        cursor: 'pointer'
                    }}
                    pointerEvents = "visible"
                    onLoad = {onLoad}
                />
            </>)}
            
        </div>
    </>;

    ////////////

    function onLoad() {
        if(!containerElRef.current) return;

        const rect = containerElRef.current.getBoundingClientRect();
        props.onResize(rect.height);
        
        console.log('--------------- SET EMBED STATE TO preview')
        setEmbedState(EmbedState.preview);
    }

};