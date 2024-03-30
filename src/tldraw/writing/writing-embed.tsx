import "./writing-embed.scss";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawWritingEditor } from "./tldraw-writing-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { TFile } from "obsidian";
import { duplicateWritingFile, needsTranscriptUpdate, saveWriteFileTranscript } from "src/utils/file-manipulation";
import { isEmptyWritingFile } from "src/utils/tldraw-helpers";
import { fetchWriteFileTranscript } from "src/logic/ocr-service";
import { useSelector } from "react-redux";
import { GlobalSessionState } from "src/logic/stores";
import { useDispatch } from 'react-redux';
import { WritingEmbedPreview } from "./writing-embed-preview/writing-embed-preview";

///////
///////

export type WritingEditorControls = {
	save: Function,
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
	const [isEditMode, setIsEditMode] = useState<boolean>(false);
	const isEditModeForScreenshottingRef = useRef<boolean>(false);
	const [curPageData, setCurPageData] = useState<InkFileData>(props.pageData);
	const editorControlsRef = useRef<WritingEditorControls>();
	const [embedId] = useState<string>(crypto.randomUUID());
	const activeEmbedId = useSelector((state: GlobalSessionState) => state.activeEmbedId || embedId);
	const dispatch = useDispatch();
	
	// Whenever switching between readonly and edit mode
	React.useEffect( () => {

		if(!isEditMode) {
			if(isEmptyWritingFile(curPageData.tldraw)) {
				setIsEditMode(true);
				
			} else if(!curPageData.previewUri) {
				console.log("Switching to edit mode for writing screenshot")
				setIsEditMode(true);
				isEditModeForScreenshottingRef.current = true;
			}

			fetchTranscriptIfNeeded(props.plugin, props.fileRef, curPageData);
		}		

	}, [isEditMode])

	// This fires the first time it enters edit mode
	const registerEditorControls = (handlers: WritingEditorControls) => {
		editorControlsRef.current = handlers;

		// Run mount actions for edit mode here to ensure editorControls is available
		if(isEditModeForScreenshottingRef.current) takeScreenshotAndReturn();
	}

	const takeScreenshotAndReturn = async () => {
		console.log('Taking writing screenshot and switching back to read-only mode');
		if(!editorControlsRef.current) return;
		isEditModeForScreenshottingRef.current = false;
		
		await editorControlsRef.current.saveAndHalt();
		const newPageData = await refreshPageData();
		setCurPageData(newPageData);
		setIsEditMode(false);
	}

	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)

	let isActive = false;
	if(embedId && embedId === activeEmbedId) isActive = true;
	if(isActive === false && isEditMode) switchToReadOnly();

	return <>
		<div
			ref = {embedContainerRef}
			className = 'ink_writing-embed'
			style = {{
				// Must be padding as margin creates codemirror calculation issues
				paddingTop: '3em',
				paddingBottom: '2.5em',
			}}
		>
			{(!isEditMode && !curPageData.previewUri) && (
				<p>This should never be show</p>
			)}
			{(!isEditMode && curPageData.previewUri) && (
				<WritingEmbedPreview
					isActive = {isActive}
					src = {curPageData.previewUri}
					// src = {previewFilePath}
					onClick = {(event) => {
						event.preventDefault();
						dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
					}}
					onEditClick = { async () => {
						const newPageData = await refreshPageData();
						setIsEditMode(true);
						setCurPageData(newPageData);
					}}
					onDuplicateClick = { async () => {
						await duplicateWritingFile(props.plugin, props.fileRef);
					}}
				/>
			)}
			{isEditMode && (
				<TldrawWritingEditor
					plugin = {props.plugin}
					fileRef = {props.fileRef}	// REVIEW: Convert this to an open function so the embed controls the open?
					pageData = {curPageData}
					save = {props.save}
					embedded
					registerControls = {registerEditorControls}
					switchToReadOnly = {switchToReadOnly}
				/>
			)}
		</div>
	</>;
	
	// Helper functions
	///////////////////

	async function switchToReadOnly() {
		// TODO: Save immediately incase it hasn't been saved yet?
		await editorControlsRef.current?.saveAndHalt();
		const newPageData = await refreshPageData();
		setCurPageData(newPageData);
		setIsEditMode(false);
	}

	async function refreshPageData(): Promise<InkFileData> {
		const v = props.plugin.app.vault;
		const pageDataStr = await v.read(props.fileRef);
		const pageData = JSON.parse(pageDataStr) as InkFileData;
		return pageData;
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
