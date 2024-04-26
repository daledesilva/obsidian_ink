import "./drawing-embed.scss";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawDrawingEditor } from "./tldraw-drawing-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { TFile } from "obsidian";
import { duplicateDrawingFile, rememberDrawingFile } from "src/utils/file-manipulation";
import { isEmptyDrawingFile } from "src/utils/tldraw-helpers";
import { GlobalSessionState } from "src/logic/stores";
import { useDispatch, useSelector } from "react-redux";
import { DrawingEmbedPreview } from "./drawing-embed-preview/drawing-embed-preview";

///////
///////

export type DrawingEditorControls = {
	save: Function,
	saveAndHalt: Function,
}

export function DrawingEmbed (props: {
	plugin: InkPlugin,
	fileRef: TFile,
	pageData: InkFileData,
	save: (pageData: InkFileData) => {},
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const embedContainerRef = useRef<HTMLDivElement>(null);
	const [isEditMode, setIsEditMode] = useState<boolean>(false);
	const isEditModeForScreenshottingRef = useRef<boolean>(false);
	const [curPageData, setCurPageData] = useState<InkFileData>(props.pageData);
	const editorControlsRef = useRef<DrawingEditorControls>();
	const [embedId] = useState<string>(crypto.randomUUID());
	const activeEmbedId = useSelector((state: GlobalSessionState) => state.activeEmbedId || embedId);
	const dispatch = useDispatch();
		
	// Whenever switching between readonly and edit mode
	React.useEffect( () => {
		
		if(!isEditMode) {
			// It's not edit mode

			if(isEmptyDrawingFile(curPageData.tldraw)) {
				setIsEditMode(true);
				
			} else if(!curPageData.previewUri) {
				// console.log("Switching to edit mode for writing screenshot")
				setIsEditMode(true);
				isEditModeForScreenshottingRef.current = true;
			}

		} else {
			// It IS edit mode
			
			if(isEditModeForScreenshottingRef.current) takeScreenshotAndReturn();
		}	

	}, [isEditMode])

	const registerEditorControls = (handlers: DrawingEditorControls) => {
		editorControlsRef.current = handlers;
	}

	const takeScreenshotAndReturn = async () => {
		// console.log('Taking drawing screenshot and switching back to read-only mode');
		if(!editorControlsRef.current) return;
		isEditModeForScreenshottingRef.current = false;
		
		await editorControlsRef.current.saveAndHalt();
		const newPageData = await refreshPageData(props.plugin, props.fileRef);
		setCurPageData(newPageData);
		setIsEditMode(false);
	}

	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)

	let isActive = embedId === activeEmbedId;
	if(!isActive && isEditMode) switchToReadOnlyIfStarted();

	return <>
		<div
			ref = {embedContainerRef}
			className = 'ink_drawing-embed'
			style = {{
				height: isEditMode ? '600px' : 'auto',
				// Must be padding as margin creates codemirror calculation issues
				paddingTop: '3em',
				paddingBottom: '2.5em',
			}}
		>
			{(!isEditMode && !curPageData.previewUri) && (
				<p>This should never be show</p>
			)}
			{(!isEditMode && curPageData.previewUri) && (
				<DrawingEmbedPreview
					isActive = {isActive}
					src = {curPageData.previewUri}
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
					onCopyClick = { async () => {
						await rememberDrawingFile(props.plugin, props.fileRef);
					}}
				/>
			)}
			{isEditMode && (
				<TldrawDrawingEditor
					plugin = {props.plugin}
					fileRef = {props.fileRef}	// REVIEW: Convert this to an open function so the embed controls the open?
					pageData = {curPageData}
					save = {props.save}
					embedded
					registerControls = {registerEditorControls}
					switchToReadOnly = {switchToReadOnlyIfStarted}
				/>
			)}
		</div>
	</>;

	// Helper functions
	///////////////////

	async function switchToReadOnlyIfStarted() {
		const newPageData = await refreshPageData(props.plugin, props.fileRef);
		
		// Don't switch to readonly if it hasn't been started (It's empty so there's no screenshot to show).
		if(!isEmptyDrawingFile(newPageData.tldraw)) {
			// console.log(`Isn't an empty writing file --------`);
			await editorControlsRef.current?.saveAndHalt();
			setCurPageData(newPageData);
			setIsEditMode(false);
		}
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
