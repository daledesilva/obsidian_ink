import "./drawing-embed.scss";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawDrawingEditor, TldrawDrawingEditorWrapper } from "./tldraw-drawing-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { TFile } from "obsidian";
import { rememberDrawingFile } from "src/utils/rememberDrawingFile";
import { GlobalSessionState } from "src/logic/stores";
import { useDispatch, useSelector } from "react-redux";
import { DrawingEmbedPreview, DrawingEmbedPreviewWrapper } from "./drawing-embed-preview/drawing-embed-preview";
import { openInkFile } from "src/utils/open-file";
import { nanoid } from "nanoid";
import { embedShouldActivateImmediately } from "src/utils/storage";
import classNames from "classnames";
import { atom, useAtom, useSetAtom } from "jotai";
const emptyDrawingSvgStr = require('../../placeholders/empty-drawing-embed.svg');

///////
///////


export enum DrawingEmbedState {
	preview = 'preview',
	loadingEditor = 'loadingEditor',
	editor = 'editor',
	loadingPreview = 'unloadingEditor',
}
export const embedStateAtom = atom(DrawingEmbedState.preview)
export const previewActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== DrawingEmbedState.editor
})
export const editorActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== DrawingEmbedState.preview
})

const INITIAL_EMBED_HEIGHT = 300;

///////

export type DrawingEditorControls = {
	save: Function,
	saveAndHalt: Function,
}

export function DrawingEmbed (props: {
	plugin: InkPlugin,
	drawingFileRef: TFile,
	pageData: InkFileData,
	save: (pageData: InkFileData) => {},
	remove: Function,
}) {
	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	const editorControlsRef = useRef<DrawingEditorControls>();
	const embedHeightRef = useRef<number>(INITIAL_EMBED_HEIGHT);
	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)
	// const [embedId] = useState<string>(nanoid());
	// const activeEmbedId = useSelector((state: GlobalSessionState) => state.activeEmbedId);
	// const dispatch = useDispatch();

	const setEmbedState = useSetAtom(embedStateAtom);

	// On first mount
	React.useEffect( () => {
		if(embedShouldActivateImmediately()) {
			// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
			setTimeout( () => {
				switchToEditMode();
			},200);
		}
	})

	// let isActive = (embedId === activeEmbedId);
	// if(!isActive && state === 'edit') {
	// 	saveAndSwitchToPreviewMode();
	// }

	const commonExtendedOptions = [
		{
			text: 'Copy drawing',
			action: async () => {
				await rememberDrawingFile(props.plugin, props.drawingFileRef);
			}
		},
		{
			text: 'Open drawing',
			action: async () => {
				openInkFile(props.plugin, props.drawingFileRef)
			}
		},
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
					height: embedHeightRef.current + 'px',
					position: 'relative', // For absolute positioning inside
				}}
			>
			
				<DrawingEmbedPreviewWrapper
					plugin = {props.plugin}
					onReady = {() => {}}
					drawingFile = {props.drawingFileRef}
					onClick = { async () => {
						// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
						switchToEditMode();
					}}
				/>
			
				<TldrawDrawingEditorWrapper
					onReady = {() => {}}
					plugin = {props.plugin}
					drawingFile = {props.drawingFileRef}
					save = {props.save}
					embedded
					saveControlsReference = {registerEditorControls}
					closeEditor = {saveAndSwitchToPreviewMode}
					extendedMenu = {commonExtendedOptions}
					resizeEmbed = {resizeEmbed}
				/>

			</div>				
		</div>
	</>;

	// Helper functions
	///////////////////

	function registerEditorControls(handlers: DrawingEditorControls) {
		editorControlsRef.current = handlers;
	}

	function resizeEmbed(pxHeightDiff: number) {
		if(!resizeContainerElRef.current) return;
		embedHeightRef.current += pxHeightDiff;
		resizeContainerElRef.current.style.height = embedHeightRef.current + 'px';
	}
	function applyEmbedHeight() {
		if(!resizeContainerElRef.current) return;
		resizeContainerElRef.current.style.height = '300px';
	}

	function resetEmbedHeight() {
		if(!embedContainerElRef.current) return;
		const newHeight = embedContainerElRef.current?.offsetHeight;
		if(newHeight) {
			embedContainerElRef.current.style.height = newHeight + 'px';
		} else {
			embedContainerElRef.current.style.height = 'unset'; // TODO: CSS transition doesn't work between number and unset
		}
	}

	function switchToEditMode() {
		applyEmbedHeight();
		setEmbedState(DrawingEmbedState.loadingEditor);
	}

	async function saveAndSwitchToPreviewMode() {
		if(editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}

		console.log('--------------- SET EMBED STATE TO loadingPreview')
		setEmbedState(DrawingEmbedState.loadingPreview);
	}
		
};

export default DrawingEmbed;

////////
////////

async function refreshPageData(plugin: InkPlugin, file: TFile): Promise<InkFileData> {
	const v = plugin.app.vault;
	const pageDataStr = await v.read(file);
	const pageData = JSON.parse(pageDataStr) as InkFileData;
	return pageData;
}
