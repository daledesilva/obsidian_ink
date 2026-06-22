import classNames from 'classnames';
import './drawing-embed-preview.scss';
import * as React from 'react';
// @ts-ignore
import SVG from 'react-inlinesvg';
import { TFile } from 'obsidian';
import { useAtomValue } from 'jotai';
import { embedsInEditModeAtom_v2 } from 'src/components/formats/current/drawing/drawing-embed/drawing-embed';
import { verbose } from 'src/logic/utils/universal-dev-logging';
import { showLockedChrome } from 'src/logic/utils/ink-file-has-strokes';
import { useInkFileHasStrokes } from 'src/logic/utils/use-ink-file-has-strokes';
import { getGlobals } from 'src/stores/global-store';
import emptyDrawingSvg from 'src/defaults/empty-drawing-embed.svg';

//////////
//////////

interface DrawingEmbedPreviewProps {
    embedId?: string,
    embeddedFile: TFile | null,
    embedSettings: { viewBox?: { x: number; y: number; width: number; height: number } },
    onReady: () => void,
	onClick: React.MouseEventHandler,
}

// Wraps the component so that it can full unmount when inactive
export const DrawingEmbedPreviewWrapper: React.FC<DrawingEmbedPreviewProps> = (props) => {
    const embedsInEditMode = useAtomValue(embedsInEditModeAtom_v2);
    const previewActive = !props.embedId || !embedsInEditMode.has(props.embedId);

    if (previewActive) {
        return <DrawingEmbedPreview {...props} />
    } else {
        return <></>
    }
}

export const DrawingEmbedPreview: React.FC<DrawingEmbedPreviewProps> = (props) => {
    const {plugin} = getGlobals();

    const containerElRef = React.useRef<HTMLDivElement>(null);
    const [fileSrc, setFileSrc] = React.useState<string | null>(null);
    const hasStrokes = useInkFileHasStrokes(props.embeddedFile, plugin.app.vault);

    React.useEffect(() => {
        verbose('PREVIEW mounted');
        refreshSrc();

        // Listen for file modifications to refresh preview when the embedded file changes
        // This enables refreshing when returning from edit mode, but also refreshes based off editing the same file in another embed.
        const onModify = (modifiedFile: TFile) => {
            if (!props.embeddedFile) return;
            if (modifiedFile.path !== props.embeddedFile.path) return;
            refreshSrc();
        };
        const eventRef = plugin.app.vault.on('modify', onModify);
        return () => {
            verbose('PREVIEW unmounting');
            // Clean up event listener on unmount
            // @ts-ignore - offref exists in Obsidian API
            plugin.app.vault.offref(eventRef);
        }
        // Re-run if the embedded file changes
    }, [props.embeddedFile])

	return <>
        <div
            ref = {containerElRef}
            className = {classNames([
                'ddc_ink_drawing-embed-preview',
                showLockedChrome(plugin.settings.drawingFrameWhenLocked, hasStrokes) && 'ddc_ink_visible-frame',
                showLockedChrome(plugin.settings.drawingBackgroundWhenLocked, hasStrokes) && 'ddc_ink_visible-background',
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
            {fileSrc && (<>
                <SVG
                    src = {fileSrc}
                    style = {{
                        width: '100%',
                        height: '100%',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        cursor: 'pointer'
                    }}
                    pointerEvents = "visible"
                    cacheRequests = {false}
                    key = {fileSrc}
                    onLoad = {onLoad}
                    viewBox = {props.embedSettings?.viewBox
						? `${props.embedSettings.viewBox.x} ${props.embedSettings.viewBox.y} ${props.embedSettings.viewBox.width} ${props.embedSettings.viewBox.height}`
						: undefined}
                />
            </>)}
        </div>
    </>;

    // Helper functions
    ///////////////////

    function onLoad() {
        // Slight delay on transition because otherwise a flicker is sometimes seen
        window.setTimeout(() => {
            props.onReady();
        }, 100);
    }

    function refreshSrc() {
        if (!props.embeddedFile) {
            setFileSrc(null);
            return;
        }
        const basePath = plugin.app.vault.getResourcePath(props.embeddedFile);
        if (!basePath) {
            setFileSrc(null);
            return;
        }
        const mtime = props.embeddedFile.stat.mtime;
        const separator = basePath.includes('?') ? '&' : '?';
        setFileSrc(`${basePath}${separator}t=${mtime}`);
    }

};



