import "./drawing-embed.scss";
import * as React from "react";
import { useRef } from "react";
import InkPlugin from "src/main";
import { InkFileData } from "src/logic/utils/page-file";
import { TFile } from "obsidian";
import { embedShouldActivateImmediately } from "src/logic/utils/storage";
import classNames from "classnames";
import { atom, useSetAtom } from "jotai";
import { DRAWING_INITIAL_WIDTH, DRAWING_INITIAL_ASPECT_RATIO } from "src/constants";
import { getFullPageWidth } from "src/logic/utils/getFullPageWidth";
import { verbose } from "src/logic/utils/log-to-console";
import { DrawingEmbedPreviewWrapper_v2 } from "../drawing-embed-preview/drawing-embed-preview";
import { EmbedSettings } from "src/types/embed-settings";
import { TldrawDrawingEditorWrapper_v2 } from "../tldraw-drawing-editor/tldraw-drawing-editor";
import { rememberDrawingFile } from "src/logic/utils/rememberDrawingFile";
import { openInkFile } from "src/logic/utils/open-file";

///////
///////


export enum DrawingEmbedState_v2 {
	preview = 'preview',
	loadingEditor = 'loadingEditor',
	editor = 'editor',
	loadingPreview = 'unloadingEditor',
}
export const embedStateAtom_v2 = atom(DrawingEmbedState_v2.preview)
export const previewActiveAtom_v2 = atom<boolean>((get) => {
    const embedState = get(embedStateAtom_v2);
    return embedState !== DrawingEmbedState_v2.editor
})
export const editorActiveAtom_v2 = atom<boolean>((get) => {
    const embedState = get(embedStateAtom_v2);
    return embedState !== DrawingEmbedState_v2.preview
})

///////

export type DrawingEditorControls = {
	save: Function,
	saveAndHalt: Function,
}

interface DrawingEmbed_v2_Props {
	embeddedFile: TFile | null,
	embedSettings: EmbedSettings,
	saveSrcFile: (pageData: InkFileData) => {},
    remove: Function,
    setEmbedProps?: (width: number, aspectRatio: number) => void,
	partialEmbedFilepath: string,
}

export function DrawingEmbed_v2 (props: DrawingEmbed_v2_Props) {

	console.log('props.embedSettings', props.embedSettings);

	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	const editorControlsRef = useRef<DrawingEditorControls>();
	const embedWidthRef = useRef<number>(props.embedSettings.embedDisplay.width || DRAWING_INITIAL_WIDTH);
	const embedAspectRatioRef = useRef<number>(props.embedSettings.embedDisplay.aspectRatio || DRAWING_INITIAL_ASPECT_RATIO);

    const setEmbedState = useSetAtom(embedStateAtom_v2);

	// On first mount
	React.useEffect( () => {
		if(embedShouldActivateImmediately()) {
			// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
			setTimeout( () => {
				switchToEditMode();
			},200);
		}
		
		window.addEventListener('resize', handleResize);
		handleResize();

        return () => {
			window.removeEventListener('resize', handleResize);
		}
	}, [])

	const commonExtendedOptions = [
		{
			text: 'Copy drawing',
			action: async () => {
				await rememberDrawingFile(props.embeddedFile as TFile);
			}
		},
		{
			text: 'Open drawing',
			action: async () => {
				await openInkFile(props.embeddedFile as TFile);
			}
		},
		{
			text: 'Remove embed',
			action: () => {
				props.remove()
			},
		},
	].filter(Boolean)

	console.log('props.embeddedFile', props.embeddedFile);

	////////////

	// TODO: style this
	if (!props.embeddedFile) {
		return <>
		<div
			style = {{
				padding: '1em',
				marginBlock: '0.5em',
				color: 'red',
				backgroundColor: 'rgba(255, 0, 0, 0.1)',
				borderRadius: '0.5em',
				textAlign: 'center',
			}}
		>
			'{props.partialEmbedFilepath}' not found
		</div>
		</>
	}

	return <>
		<div
			ref = {embedContainerElRef}
			className = {classNames([
				'ddc_ink_embed',
				'ddc_ink_drawing-embed',
			])}
			style = {{
				// Must be padding as margin creates codemirror calculation issues
				paddingTop: '1em',
				paddingBottom: '0.5em',
			}}
		>
			{/* Include another container so that it's height isn't affected by the padding of the outer container */}
			<div
				className = 'ddc_ink_resize-container'
				ref = {resizeContainerElRef}
				style = {{
					width: embedWidthRef.current + 'px',
					height: embedWidthRef.current / embedAspectRatioRef.current + 'px',
					position: 'relative', // For absolute positioning inside
					left: '50%',
					translate: '-50%',
				}}
			>
			
                <DrawingEmbedPreviewWrapper_v2
					embeddedFile = {props.embeddedFile}
					embedSettings = {props.embedSettings}
					onReady = {() => {}}
					onClick = { async () => {
						// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
						switchToEditMode();
					}}
				/>
			
                <TldrawDrawingEditorWrapper_v2
					onReady = {() => {}}
					drawingFile = {props.embeddedFile}
					save = {props.saveSrcFile}
					extendedMenu = {commonExtendedOptions}
					embedded
					saveControlsReference = {registerEditorControls}
					closeEditor = {saveAndSwitchToPreviewMode}
					resizeEmbed = {resizeEmbed}
				/>

			</div>				
		</div>
	</>;

	//// Helper functions
	/////////////////////

	function registerEditorControls(handlers: DrawingEditorControls) {
		editorControlsRef.current = handlers;
	}

	function resizeEmbed(pxWidthDiff: number, pxHeightDiff: number) {
		if(!resizeContainerElRef.current) return;
		const maxWidth = getFullPageWidth(embedContainerElRef.current)
		if(!maxWidth) return;

		let destWidth = embedWidthRef.current + pxWidthDiff;
		if(destWidth < 350) destWidth = 350;
		if(destWidth > maxWidth) destWidth = maxWidth;
		
		const curHeight = resizeContainerElRef.current.getBoundingClientRect().height;
		let destHeight = curHeight + pxHeightDiff;
		if(destHeight < 150) destHeight = 150;

		embedWidthRef.current = destWidth;
		embedAspectRatioRef.current = destWidth / destHeight;
		resizeContainerElRef.current.style.width = embedWidthRef.current + 'px';
		resizeContainerElRef.current.style.height = destHeight + 'px';
		// props.setEmbedProps(embedHeightRef.current); // NOTE: Can't do this here because it causes the embed to reload
	}
	function applyEmbedHeight() {
		if(!resizeContainerElRef.current) return;
		resizeContainerElRef.current.style.width = embedWidthRef.current + 'px';
		const curWidth = resizeContainerElRef.current.getBoundingClientRect().width;
		resizeContainerElRef.current.style.height = curWidth/embedAspectRatioRef.current + 'px';
	}

	// function resetEmbedHeight() {
	// 	if(!embedContainerElRef.current) return;
	// 	const newHeight = embedContainerElRef.current?.offsetHeight;
	// 	if(newHeight) {
	// 		embedContainerElRef.current.style.height = newHeight + 'px';
	// 	} else {
	// 		embedContainerElRef.current.style.height = 'unset'; // TODO: CSS transition doesn't work between number and unset
	// 	}
	// }

	function switchToEditMode() {
		verbose('Set DrawingEmbedState: loadingEditor')
		applyEmbedHeight();
        setEmbedState(DrawingEmbedState_v2.loadingEditor);
	}

    async function saveAndSwitchToPreviewMode() {
		verbose('Set DrawingEmbedState: loadingPreview');

		if(editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}
		
        setEmbedState(DrawingEmbedState_v2.loadingPreview);
        if (props.setEmbedProps) {
            props.setEmbedProps(embedWidthRef.current, embedAspectRatioRef.current);
        }
	}

	function handleResize() {
		const maxWidth = getFullPageWidth(embedContainerElRef.current);
		if (resizeContainerElRef.current) {
			resizeContainerElRef.current.style.maxWidth = '100%';
			const curWidth = resizeContainerElRef.current.getBoundingClientRect().width;
			resizeContainerElRef.current.style.height = curWidth/embedAspectRatioRef.current + 'px';
		}
	};
};


export default DrawingEmbed_v2;

////////
////////

async function refreshPageData(plugin: InkPlugin, file: TFile): Promise<InkFileData> {
	const v = plugin.app.vault;
	const pageDataStr = await v.read(file);
	const pageData = JSON.parse(pageDataStr) as InkFileData;
	return pageData;
}
