import "./drawing-embed.scss";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawDrawingEditor, TldrawDrawingEditorWrapper } from "../../../tldraw_v1/drawing/tldraw-drawing-editor/tldraw-drawing-editor";
import InkPlugin from "../../../main";
import { InkFileData } from "../../../utils/page-file";
import { TFile } from "obsidian";
import { rememberDrawingFile } from "src/utils/rememberDrawingFile";
import { GlobalSessionState } from "src/logic/stores";
import { useDispatch, useSelector } from "react-redux";
import { DrawingEmbedPreview, DrawingEmbedPreviewWrapper } from "../../../tldraw_v1/drawing/drawing-embed-preview/drawing-embed-preview";
import { openInkFile } from "src/utils/open-file";
import { nanoid } from "nanoid";
import { embedShouldActivateImmediately } from "src/utils/storage";
import classNames from "classnames";
import { atom, useAtom, useSetAtom } from "jotai";
import { DRAWING_INITIAL_WIDTH, DRAWING_INITIAL_ASPECT_RATIO } from "src/constants";
import { getFullPageWidth } from "src/utils/getFullPageWidth";
import { verbose } from "src/utils/log-to-console";
import { getGlobals } from "src/stores/global-store";
import { DrawingEmbedPreviewWrapperNew } from "../drawing-embed-preview/drawing-embed-preview";

///////
///////


export enum DrawingEmbedNewState {
	preview = 'preview',
	loadingEditor = 'loadingEditor',
	editor = 'editor',
	loadingPreview = 'unloadingEditor',
}
export const embedStateAtom = atom(DrawingEmbedNewState.preview)
export const previewActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== DrawingEmbedNewState.editor
})
export const editorActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== DrawingEmbedNewState.preview
})

///////

export type DrawingEditorControls = {
	save: Function,
	saveAndHalt: Function,
}

interface DrawingEmbedNewProps {
	mdFile: TFile,
	partialPreviewFilepath: string,
	embedSettings: any,
	remove: Function,
}

export function DrawingEmbedNew (props: DrawingEmbedNewProps) {
	const {plugin} = getGlobals();

	const width = 1000;
	const aspectRatio = 16/9;

	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	const editorControlsRef = useRef<DrawingEditorControls>();
	const embedWidthRef = useRef<number>(width || DRAWING_INITIAL_WIDTH);
	const embedAspectRatioRef = useRef<number>(aspectRatio || DRAWING_INITIAL_ASPECT_RATIO);

	const setEmbedState = useSetAtom(embedStateAtom);

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
		// TODO: Bring these back
		// {
		// 	text: 'Copy drawing',
		// 	action: async () => {
		// 		await rememberDrawingFile(plugin, props.drawingFileRef);
		// 	}
		// },
		// {
		// 	text: 'Open drawing',
		// 	action: async () => {
		// 		openInkFile(plugin, props.drawingFileRef)
		// 	}
		// },
		{
			text: 'Remove embed',
			action: () => {
				props.remove()
			},
		},
	]

	////////////

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
			
				<DrawingEmbedPreviewWrapperNew
					mdFile = {props.mdFile}
					partialPreviewFilepath = {props.partialPreviewFilepath}
					embedSettings = {props.embedSettings}
					onReady = {() => {}}
					onClick = { async () => {
						// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
						switchToEditMode();
					}}
				/>
			
				{/* <TldrawDrawingEditorWrapper
					onReady = {() => {}}
					plugin = {plugin}
					filepath = {props.filepath}
					embedSettings = {props.embedSettings}
					save = {saveSrcFile}
					embedded
					saveControlsReference = {registerEditorControls}
					closeEditor = {saveAndSwitchToPreviewMode}
					extendedMenu = {commonExtendedOptions}
					resizeEmbed = {resizeEmbed}
				/> */}

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
		setEmbedState(DrawingEmbedNewState.loadingEditor);
	}

	async function saveAndSwitchToPreviewMode() {
		verbose('Set DrawingEmbedState: loadingPreview');

		if(editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}
		
		setEmbedState(DrawingEmbedNewState.loadingPreview);
		// props.setEmbedProps(embedWidthRef.current, embedAspectRatioRef.current);
	}

	function handleResize() {
		const maxWidth = getFullPageWidth(embedContainerElRef.current);
		if (resizeContainerElRef.current) {
			resizeContainerElRef.current.style.maxWidth = maxWidth + 'px';
			const curWidth = resizeContainerElRef.current.getBoundingClientRect().width;
			resizeContainerElRef.current.style.height = curWidth/embedAspectRatioRef.current + 'px';
		}
	};
};


export default DrawingEmbedNew;

////////
////////

async function refreshPageData(plugin: InkPlugin, file: TFile): Promise<InkFileData> {
	const v = plugin.app.vault;
	const pageDataStr = await v.read(file);
	const pageData = JSON.parse(pageDataStr) as InkFileData;
	return pageData;
}
