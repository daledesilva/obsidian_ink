import classNames from 'classnames';
import './writing-embed-preview.scss';
import * as React from 'react';
import SVG from 'react-inlinesvg';
import { PrimaryMenuBar } from 'src/components/jsx-components/primary-menu-bar/primary-menu-bar';
import TransitionMenu from 'src/components/jsx-components/transition-menu/transition-menu';
import InkPlugin from 'src/main';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { WritingEmbedState, embedStateAtom, previewActiveAtom } from '../writing-embed/writing-embed';
import { TFile } from 'obsidian';
import { getGlobals } from 'src/stores/global-store';
const emptyWritingSvg = require('src/defaults/empty-writing-embed.svg');

//////////
//////////

interface WritingEmbedPreviewProps {
    plugin: InkPlugin,
    onResize: Function,
    writingFile: TFile,
    onClick: React.MouseEventHandler,
}

// Wraps the component so that it can full unmount when inactive
export const WritingEmbedPreviewWrapper: React.FC<WritingEmbedPreviewProps> = (props) => {
    const previewActive = useAtomValue(previewActiveAtom);
    //console.log('PREVIEW ACTIVE', previewActive)

    if (previewActive) {
        return <WritingEmbedPreview {...props} />
    } else {
        return <></>
    }
}

const WritingEmbedPreview: React.FC<WritingEmbedPreviewProps> = (props) => {
    //console.log('PREVIEW rendering');

    const containerElRef = React.useRef<HTMLDivElement>(null);
    const setEmbedState = useSetAtom(embedStateAtom);
    const [fileSrc, setFileSrc] = React.useState<string>(emptyWritingSvg);

    React.useEffect(() => {
        //console.log('PREVIEW mounted');
        refreshSrc();

        // Listen for file modifications to refresh preview when the embedded file changes
        // This enables refreshing when returning from edit mode, but also refreshes based off editing the same file in another embed.
        const onModify = (modifiedFile: TFile) => {
            if (!props.writingFile) return;
            if (modifiedFile.path !== props.writingFile.path) return;
            refreshSrc();
        };
        const eventRef = props.plugin.app.vault.on('modify', onModify);
        return () => {
            //console.log('PREVIEW unmounting');
            // @ts-ignore - offref exists in Obsidian API
            props.plugin.app.vault.offref(eventRef);
        }
    }, [props.writingFile])

    // Check if src is a DataURI. If not, it's an SVG
    const isImg = fileSrc.slice(0, 4) === 'data';

    return <>
        <div
            ref={containerElRef}
            className={classNames([
                'ddc_ink_writing-embed-preview',
                props.plugin.settings.writingLinesWhenLocked && 'ddc_ink_visible-lines',
                props.plugin.settings.writingBackgroundWhenLocked && 'ddc_ink_visible-background',
            ])}
            style={{
                position: 'absolute',
                width: '100%',
                backgroundColor: 'transparent'
            }}
            onClick={props.onClick}

            // Not currently doing this cause it can mean users easily lose their undo history
            // onMouseUp = {props.onEditClick}
            // onMouseEnter = {props.onClick}
        >
            {isImg && (<>
                <img
                    src={fileSrc}
                    key={fileSrc}
                    style={{
                        width: '100%',
                        cursor: 'pointer',
                        pointerEvents: 'all',
                    }}
                    onLoad={onLoad}
                />
            </>)}

            {!isImg && (<>
                <SVG
                    src={fileSrc}
                    cacheRequests={false}
                    key={fileSrc}
                    style={{
                        width: '100%',
                        height: 'unset',
                        cursor: 'pointer'
                    }}
                    pointerEvents="visible"
                    onLoad={onLoad}
                />
            </>)}

        </div>
    </>;

    // Helper functions
    ///////////////////

    function onLoad() {
        recalcHeight();
        // Slight delay on transition because otherwise a flicker is sometimes seen
        setTimeout(() => {
            //console.log('--------------- SET EMBED STATE TO preview')
            setEmbedState(WritingEmbedState.preview);
        }, 100);
    }

    async function fetchFileData() {
        refreshSrc();
    }

    function refreshSrc() {
        const basePath = props.plugin.app.vault.getResourcePath(props.writingFile);
        if (!basePath) return;
        const mtime = props.writingFile.stat.mtime;
        const separator = basePath.includes('?') ? '&' : '?';
        setFileSrc(`${basePath}${separator}t=${mtime}`);
    }

    function recalcHeight() {
        if (!containerElRef.current) return;
        
        // Only run when embed is first in view area and then stop.
        // This makes sure it has been rendered and has a height.
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.target !== containerElRef.current) return;
                if (!entry.isIntersecting) return;

                const rect = containerElRef.current.getBoundingClientRect();
                props.onResize(rect.height);
                observer.unobserve(containerElRef.current);
            });
        });
        observer.observe(containerElRef.current);

    }

};