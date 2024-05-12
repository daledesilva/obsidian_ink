import "./writing-embed.scss";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawWritingEditor } from "./tldraw-writing-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { TFile } from "obsidian";
import { duplicateWritingFile, needsTranscriptUpdate, rememberDrawingFile, rememberWritingFile, saveWriteFileTranscript } from "src/utils/file-manipulation";
import { isEmptyWritingFile } from "src/utils/tldraw-helpers";
import { fetchWriteFileTranscript } from "src/logic/ocr-service";
import { useSelector } from "react-redux";
import { GlobalSessionState } from "src/logic/stores";
import { useDispatch } from 'react-redux';
import { WritingEmbedPreview } from "./writing-embed-preview/writing-embed-preview";
import { openInkFile } from "src/utils/open-file";

///////
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
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const embedContainerRef = useRef<HTMLDivElement>(null);
	const [state, setState] = useState<'preview'|'edit'>('preview');
	const [curPageData, setCurPageData] = useState<InkFileData>(props.pageData);
	const editorControlsRef = useRef<WritingEditorControls>();
	const [embedId] = useState<string>(crypto.randomUUID());
	const activeEmbedId = useSelector((state: GlobalSessionState) => state.activeEmbedId);
	const dispatch = useDispatch();
	const [staticEmbedHeight, setStaticEmbedHeight] = useState<number | null>(null);
	
	// Whenever switching between readonly and edit mode
	React.useEffect( () => {
		if(state === 'preview') {
			if(!curPageData.previewUri) {
				console.log('Editing because no preview Url yet')
				dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
				switchToEditMode();
			}
			fetchTranscriptIfNeeded(props.plugin, props.fileRef, curPageData);
		}
	}, [state])

	// This fires the first time it enters edit mode
	const registerEditorControls = (handlers: WritingEditorControls) => {
		editorControlsRef.current = handlers;
	}

	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)

	let isActive = embedId === activeEmbedId;
	if(!isActive && state === 'edit'){
		saveAndSwitchToPreviewMode();
	}

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
		// }
	]

	return <>
		<div
			ref = {embedContainerRef}
			className = 'ink_writing-embed'
			style = {{
				// Must be padding as margin creates codemirror calculation issues
				paddingTop: state=='edit' ? '3em' : '1em',
				paddingBottom: state=='edit' ? '2em' : '0.5em',
				height: staticEmbedHeight ? staticEmbedHeight : 'unset', // TODO: CSS transition doesn't work between number and unset
			}}
		>
			{(state === 'preview' && !curPageData.previewUri) && (
				<p>
					Your writing embed doesn't have a valid screenshot.<br/>
					Try opening the source file directly to fix.
					({props.fileRef.path})
				</p>
			)}
			{(state === 'preview' && curPageData.previewUri) && (
				<WritingEmbedPreview
					plugin = {props.plugin}
					onReady = {() => {
						setStaticEmbedHeight(null);
					}}
					isActive = {isActive}
					src = {curPageData.previewUri}	// REVIEW: Even though the screenshot might be taken, I'm still using the URI. This is why iPad still works.
					// src = {previewFilePath}
					onClick = {(event) => {
						event.preventDefault();
						dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
					}}
					onEditClick = { async () => {
						const newPageData = await refreshPageData(props.plugin, props.fileRef);
						setCurPageData(newPageData);
						switchToEditMode();
					}}
					commonExtendedOptions = {commonExtendedOptions}
				/>
			)}
			{state === 'edit' && (
				<TldrawWritingEditor
					onReady = {() => {
						setStaticEmbedHeight(null);
					}}
					plugin = {props.plugin}
					fileRef = {props.fileRef}	// REVIEW: Convert this to an open function so the embed controls the open?
					pageData = {curPageData}
					save = {props.save}
					embedded
					registerControls = {registerEditorControls}
					closeEditor = {saveAndSwitchToPreviewMode}
					commonExtendedOptions = {commonExtendedOptions}
				/>
			)}
		</div>
	</>;
	
	// Helper functions
	///////////////////

	function switchToEditMode() {
		setStaticEmbedHeight(embedContainerRef.current?.offsetHeight || null);
		setState('edit');
	}
	
	async function saveAndSwitchToPreviewMode() {
		if(editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}
		const newPageData = await refreshPageData(props.plugin, props.fileRef);
		setCurPageData(newPageData);
		setStaticEmbedHeight(embedContainerRef.current?.offsetHeight || null);
		setState('preview');
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
