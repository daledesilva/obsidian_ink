import classNames from 'classnames';
import './writing-embed-preview.scss';
import * as React from 'react';
import SVG from 'react-inlinesvg';
import InkPlugin from 'src/main';
import { useAtomValue, useSetAtom } from 'jotai';
import { WritingEmbedState_v1, embedStateAtom_v1, previewActiveAtom } from '../writing-embed-editor/writing-embed';
import { TFile } from 'obsidian';
import { getInkFileData } from 'src/components/formats/v1-code-blocks/utils/getInkFileData';
const emptyWritingSvg = require('src/defaults/empty-writing-embed.svg');

//////////
//////////

interface WritingEmbedPreviewProps_v1 {
    plugin: InkPlugin,
    onResize: Function,
    writingFile: TFile,
    onClick: React.MouseEventHandler,
}

// Wraps the component so that it can full unmount when inactive
export const WritingEmbedPreviewWrapper_v1: React.FC<WritingEmbedPreviewProps_v1> = (props) => {
    const previewActive = useAtomValue(previewActiveAtom);
    //console.log('PREVIEW ACTIVE', previewActive)

    if (previewActive) {
        return <WritingEmbedPreview_v1 {...props} />
    } else {
        return <></>
    }
}

const WritingEmbedPreview_v1: React.FC<WritingEmbedPreviewProps_v1> = (props) => {
    //console.log('PREVIEW rendering');

    const containerElRef = React.useRef<HTMLDivElement>(null);
    const setEmbedState = useSetAtom(embedStateAtom_v1);
    const [fileSrc, setFileSrc] = React.useState<string>(emptyWritingSvg);

    React.useEffect(() => {
        //console.log('PREVIEW mounted');
        fetchFileData();
        return () => {
            //console.log('PREVIEW unmounting');
        }
    })

    // 配置UI覆盖以启用右键菜单
    const uiOverrides = {
        // 确保上下文菜单(右键菜单)保持默认行为
        ContextMenu: (props: any) => {
            return <props.Component {...props} />;
        },
        // 确保画布菜单(空白处右键菜单)保持默认行为
        CanvasMenu: (props: any) => {
            return <props.Component {...props} />;
        },
        // 确保形状菜单(选中元素后右键菜单)保持默认行为
        ShapeMenu: (props: any) => {
            return <props.Component {...props} />;
        }
    };

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
            }}
            onClick={props.onClick}

            // Not currently doing this cause it can mean users easily lose their undo history
            // onMouseUp = {props.onEditClick}
            // onMouseEnter = {props.onClick}
        >
            {isImg && (<>
                <img
                    src={fileSrc}
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
            setEmbedState(WritingEmbedState_v1.preview);
        }, 100);
    }

    async function fetchFileData() {
        const inkFileData = await getInkFileData(props.writingFile)
        if (inkFileData.previewUri) setFileSrc(inkFileData.previewUri)
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