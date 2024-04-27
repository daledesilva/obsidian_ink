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
			// It's not edit mode

			if(isEmptyWritingFile(curPageData.tldraw)) {
				setIsEditMode(true);
				
			} else if(!curPageData.previewUri) {
				// console.log("Switching to edit mode for writing screenshot")
				setIsEditMode(true);
				isEditModeForScreenshottingRef.current = true;
			}

			fetchTranscriptIfNeeded(props.plugin, props.fileRef, curPageData);

		} else {
			// It IS edit mode
			if(isEditModeForScreenshottingRef.current) takeScreenshotAndReturn();
		}

	}, [isEditMode])

	// This fires the first time it enters edit mode
	const registerEditorControls = (handlers: WritingEditorControls) => {
		editorControlsRef.current = handlers;
	}

	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)

	let isActive = embedId === activeEmbedId;
	if(!isActive && isEditMode) switchToReadOnlyIfStarted();

	const commonExtendedOptions = [
		{
			text: 'Copy writing',
			action: async () => {
				await rememberDrawingFile(props.plugin, props.fileRef);
			}
		},
		{
			text: 'Open writing',
			action: async () => {
				openInkFile(props.plugin, props.fileRef)
			}
		}
	]

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
				<p>
					Your writing embed doesn't have a valid screenshot.<br/>
					Try opening the source file directly to fix.
					({props.fileRef.path})
				</p>
			)}
			{(!isEditMode && curPageData.previewUri) && (
				<WritingEmbedPreview
					isActive = {isActive}
					src = {curPageData.previewUri}	// REVIEW: Even though the screenshot might be taken, I'm still using the URI. This is why iPad still works.
					// src = {previewFilePath}
					onClick = {(event) => {
						event.preventDefault();
						dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
					}}
					onEditClick = { async () => {
						const newPageData = await refreshPageData(props.plugin, props.fileRef);
						setIsEditMode(true);
						setCurPageData(newPageData);
					}}
					commonExtendedOptions = {commonExtendedOptions}
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
					switchToReadOnly = {switchToReadOnlyIfStarted}
					commonExtendedOptions = {commonExtendedOptions}
				/>
			)}
		</div>
	</>;
	
	// Helper functions
	///////////////////

	async function switchToReadOnlyIfStarted() {
		const newPageData = await refreshPageData(props.plugin, props.fileRef);
		
		// Don't switch to readonly if it hasn't been started (It's empty so there's no screenshot to show).
		if(!isEmptyWritingFile(newPageData.tldraw)) {
			// console.log(`Isn't an empty writing file --------`);
			await editorControlsRef.current?.saveAndHalt();
			setCurPageData(newPageData);
			setIsEditMode(false);
		}
	}

	async function takeScreenshotAndReturn() {
		// console.log('Taking writing screenshot and switching back to read-only mode');
		if(!editorControlsRef.current) return;
		isEditModeForScreenshottingRef.current = false;
		
		await editorControlsRef.current.saveAndHalt();
		const newPageData = await refreshPageData(props.plugin, props.fileRef);
		setCurPageData(newPageData);
		setIsEditMode(false);
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
