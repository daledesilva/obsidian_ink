import "./writing-embed.scss";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawWritingEditorWrapper } from "./tldraw-writing-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { TFile } from "obsidian";
import { duplicateWritingFile, rememberDrawingFile, rememberWritingFile } from "src/utils/rememberDrawingFile";
import { isEmptyWritingFile } from "src/utils/tldraw-helpers";
import { useSelector } from "react-redux";
import { GlobalSessionState } from "src/logic/stores";
import { useDispatch } from 'react-redux';
import { WritingEmbedPreviewWrapper } from "./writing-embed-preview/writing-embed-preview";
import { openInkFile } from "src/utils/open-file";
import { nanoid } from "nanoid";
import { embedShouldActivateImmediately } from "src/utils/storage";
import classNames from "classnames";
import { atom, useSetAtom } from "jotai";
import { getInkFileData } from "src/utils/getInkFileData";

///////
///////


export enum WritingEmbedState {
	preview = 'preview',
	loadingEditor = 'loadingEditor',
	editor = 'editor',
	loadingPreview = 'unloadingEditor',
}
export const embedStateAtom = atom(WritingEmbedState.preview)
export const previewActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== WritingEmbedState.editor
})
export const editorActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== WritingEmbedState.preview
})

///////

export type WritingEditorControls = {
	save: Function,
	saveAndHalt: Function,
}

export function WritingEmbed (props: {
	plugin: InkPlugin,
	writingFileRef: TFile,
	pageData: InkFileData,
	save: (pageData: InkFileData) => void,
	remove: Function,
}) {
	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	const editorControlsRef = useRef<WritingEditorControls>();
	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)
	// const [embedId] = useState<string>(nanoid());
	// const activeEmbedId = useSelector((state: GlobalSessionState) => state.activeEmbedId);
	// const dispatch = useDispatch();

	const setEmbedState = useSetAtom(embedStateAtom);
	
	// On first mount
	React.useEffect( () => {
		//console.log('EMBED mounted')
		if(embedShouldActivateImmediately()) {
			// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
			setTimeout( () => {
				switchToEditMode();
			},200);	// TODO: Why is there a delay?
		}
	}, [])

	// Whenever switching between readonly and edit mode
	// React.useEffect( () => {
	// 	if(embedState === EmbedState.preview) {
	// 		fetchTranscriptIfNeeded(props.plugin, props.fileRef, curPageData.current);
	// 	}
	// }, [embedState])

	// let isActive = (embedId === activeEmbedId);
	// if(!isActive && state === 'edit'){
	// 	saveAndSwitchToPreviewMode();
	// }

	const commonExtendedOptions = [
		{
			text: 'Copy writing',
			action: async () => {
				await rememberWritingFile(props.plugin, props.writingFileRef);
			}
		},
		// {
		// 	text: 'Open writing',
		// 	action: async () => {
		// 		openInkFile(props.plugin, props.fileRef)
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
				'ddc_ink_writing-embed',
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
			>
			
				<WritingEmbedPreviewWrapper
					plugin = {props.plugin}
					onResize = {(height: number) => resizeContainer(height)}
					writingFile = {props.writingFileRef}
					onClick = {async (event) => {
						// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
						// setPageData( await refreshPageData(props.plugin, props.fileRef) );
						switchToEditMode();
					}}
				/>

				<TldrawWritingEditorWrapper
					plugin = {props.plugin} // TODO: Try and remove this
					onResize = {(height: number) => resizeContainer(height)}
					writingFile = {props.writingFileRef}
					save = {props.save}
					embedded
					registerControls = {registerEditorControls}
					closeEditor = {saveAndSwitchToPreviewMode}
					commonExtendedOptions = {commonExtendedOptions}
				/>

			</div>

		</div>
	</>;
	
	// Helper functions
	///////////////////

	function registerEditorControls(handlers: WritingEditorControls) {
		editorControlsRef.current = handlers;
	}

	function resizeContainer(height: number) {
		if(!resizeContainerElRef.current) return;
		resizeContainerElRef.current.style.height = height + 'px';
		setTimeout( () => {
			// Applies after slight delay so it doesn't affect the first resize
			if(!resizeContainerElRef.current) return;
			resizeContainerElRef.current.classList.add('ddc_ink_smooth-transition');
		}, 100)
	}

	function switchToEditMode() {
		console.log('--------------- SET EMBED STATE TO loadingEditor')
		setEmbedState(WritingEmbedState.loadingEditor);
	}
	
	async function saveAndSwitchToPreviewMode() {
		if(editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}

		//console.log('--------------- SET EMBED STATE TO loadingPreview')
		setEmbedState(WritingEmbedState.loadingPreview);
	}
	
};

export default WritingEmbed;
