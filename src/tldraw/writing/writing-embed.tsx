import "./writing-embed.scss";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawWritingEditorWrapper } from "./tldraw-writing-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { TFile } from "obsidian";
import { needsTranscriptUpdate, saveWriteFileTranscript } from "src/utils/needsTranscriptUpdate";
import { duplicateWritingFile, rememberDrawingFile, rememberWritingFile } from "src/utils/rememberDrawingFile";
import { isEmptyWritingFile } from "src/utils/tldraw-helpers";
import { fetchWriteFileTranscript } from "src/logic/ocr-service";
import { useSelector } from "react-redux";
import { GlobalSessionState } from "src/logic/stores";
import { useDispatch } from 'react-redux';
import { WritingEmbedPreviewWrapper } from "./writing-embed-preview/writing-embed-preview";
import { openInkFile } from "src/utils/open-file";
import { nanoid } from "nanoid";
import { embedShouldActivateImmediately } from "src/utils/storage";
import classNames from "classnames";
import { create, StoreApi } from 'zustand'
import { createContext } from "zustand-di";
import { atom, useAtom, useSetAtom } from "jotai";
const emptyWritingSvg = require('../../placeholders/empty-writing-embed.svg');

///////
///////


export enum EmbedState {
	preview = 'preview',
	loadingEditor = 'loadingEditor',
	editor = 'editor',
	loadingPreview = 'unloadingEditor',
}
export const embedStateAtom = atom(EmbedState.preview)
export const previewActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	console.log('EMBED STATE', embedState);
	return embedState !== EmbedState.editor
})
export const editorActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	console.log('EMBED STATE', embedState);
	return embedState !== EmbedState.preview
})

///////

export type WritingEditorControls = {
	// save: Function,
	saveAndHalt: Function,
}

export function WritingEmbed (props: {
	plugin: InkPlugin,
	fileRef: TFile,
	pageData: InkFileData,
	save: (pageData: InkFileData) => void,
	remove: Function,
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	const [curPageData, setCurPageData] = useState<InkFileData>(props.pageData);
	const editorControlsRef = useRef<WritingEditorControls>();
	const [embedId] = useState<string>(nanoid());
	// const activeEmbedId = useSelector((state: GlobalSessionState) => state.activeEmbedId);
	// const dispatch = useDispatch();

	const setEmbedState = useSetAtom(embedStateAtom);
	
	// On first mount
	React.useEffect( () => {
		if(embedShouldActivateImmediately()) {
			// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
			switchToEditMode();
		}
	})

	// Whenever switching between readonly and edit mode
	// React.useEffect( () => {
	// 	if(embedState === EmbedState.preview) {
	// 		fetchTranscriptIfNeeded(props.plugin, props.fileRef, curPageData);
	// 	}
	// }, [embedState])

	// This fires the first time it enters edit mode
	const registerEditorControls = (handlers: WritingEditorControls) => {
		editorControlsRef.current = handlers;
	}

	const resizeContainer = (height: number) => {
		if(!resizeContainerElRef.current) return;
		resizeContainerElRef.current.style.height = height + 'px';
	}

	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)

	// let isActive = (embedId === activeEmbedId);
	// if(!isActive && state === 'edit'){
	// 	saveAndSwitchToPreviewMode();
	// }

	const commonExtendedOptions = [
		{
			text: 'Copy writing',
			action: async () => {
				await rememberWritingFile(props.plugin, props.fileRef);
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
				// paddingTop: state=='edit' ? '3em' : '1em',
				// paddingBottom: state=='edit' ? '2em' : '0.5em',
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
					src = {curPageData.previewUri || emptyWritingSvg }
					// src = {previewFilePath}
					onClick = {async (event) => {
						// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
						const newPageData = await refreshPageData(props.plugin, props.fileRef);
						setCurPageData(newPageData);
						switchToEditMode();
					}}
				/>

				<TldrawWritingEditorWrapper
					plugin = {props.plugin}
					onResize = {(height: number) => resizeContainer(height)}
					fileRef = {props.fileRef}	// REVIEW: Convert this to an open function so the embed controls the open?
					pageData = {curPageData}
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

	function switchToEditMode() {
		setEmbedState(EmbedState.loadingEditor);
	}
	
	async function saveAndSwitchToPreviewMode() {
		if(editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}
		const newPageData = await refreshPageData(props.plugin, props.fileRef);
		setCurPageData(newPageData);

		setEmbedState(EmbedState.loadingPreview);
	}
	
};

export default WritingEmbed;

/////////
/////////

// REVIEW: Move to a helper file
const fetchTranscriptIfNeeded = (plugin: InkPlugin, fileRef: TFile, pageData: InkFileData): void => {
	if(needsTranscriptUpdate(pageData)) {
		fetchWriteFileTranscript()
			.then((transcript) => {
				saveWriteFileTranscript(plugin, fileRef, transcript)
			})
	}
}

async function refreshPageData(plugin: InkPlugin, file: TFile): Promise<InkFileData> {
	const v = plugin.app.vault;
	const pageDataStr = await v.read(file);
	const pageData = JSON.parse(pageDataStr) as InkFileData;
	return pageData;
}
