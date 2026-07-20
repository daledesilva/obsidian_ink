import classNames from 'classnames';
import './writing-embed-preview.scss';
import * as React from 'react';
import SVG from 'react-inlinesvg';
import InkPlugin from 'src/main';
import { useAtomValue } from 'jotai';
import { embedsInEditModeAtom } from '../writing-embed/writing-embed';
import { TFile } from 'obsidian';
import { showLockedChrome } from 'src/logic/utils/ink-file-has-strokes';
import { useInkFileHasStrokes } from 'src/logic/utils/use-ink-file-has-strokes';
import emptyWritingSvg from 'src/defaults/empty-writing-embed.svg';

//////////
//////////

interface WritingEmbedPreviewProps {
    embedId?: string,
    plugin: InkPlugin,
    onResize: (height: number) => void,
    writingFile: TFile,
    onClick: React.MouseEventHandler,
}

// Wraps the component so that it can full unmount when inactive
export const WritingEmbedPreviewWrapper: React.FC<WritingEmbedPreviewProps> = (props) => {
    const embedsInEditMode = useAtomValue(embedsInEditModeAtom);
    const previewActive = !props.embedId || !embedsInEditMode.has(props.embedId);

    if (previewActive) {
        return <WritingEmbedPreview {...props} />
    } else {
        return <></>
    }
}

export const WritingEmbedPreview: React.FC<WritingEmbedPreviewProps> = (props) => {
    const containerElRef = React.useRef<HTMLDivElement>(null);
    const [fileSrc, setFileSrc] = React.useState<string>(emptyWritingSvg);
    const hasStrokes = useInkFileHasStrokes(props.writingFile, props.plugin.app.vault);

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
                showLockedChrome(props.plugin.settings.writingLinesWhenLocked, hasStrokes) && 'ddc_ink_visible-lines',
                showLockedChrome(props.plugin.settings.writingBackgroundWhenLocked, hasStrokes) && 'ddc_ink_visible-background',
            ])}
            style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                pointerEvents: 'all',
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
                        height: '100%',
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
                        height: '100%',
                        maxWidth: '100%',
                        maxHeight: '100%',
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
        // Slight delay on transition because otherwise a flicker is sometimes seen
        window.setTimeout(() => {}, 100);
    }

    function refreshSrc() {
        const basePath = props.plugin.app.vault.getResourcePath(props.writingFile);
        if (!basePath) return;
        const mtime = props.writingFile.stat.mtime;
        const separator = basePath.includes('?') ? '&' : '?';
        setFileSrc(`${basePath}${separator}t=${mtime}`);
    }

};