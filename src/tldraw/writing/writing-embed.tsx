import "./writing-embed.scss";
import { Editor, SerializedStore, TLRecord, Tldraw, preventDefault } from "@tldraw/tldraw";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawWritingEditor } from "./tldraw-writing-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { TransitionMenuBar } from "../transition-menu-bar/transition-menu-bar";
import { openInkFile } from "src/utils/open-file";
import { TFile, Notice } from "obsidian";
import { duplicateWritingFile, needsTranscriptUpdate, saveWriteFileTranscript } from "src/utils/file-manipulation";
import { isEmptyWritingFile } from "src/utils/tldraw-helpers";
import { fetchWriteFileTranscript } from "src/logic/ocr-service";
import { useSelector } from "react-redux";
import { GlobalSessionSlice } from "src/logic/stores";
import { useDispatch } from 'react-redux';

///////
///////

// Global variables
// TODO: This needs to be a React managed variable so that it causes rerenders
let activeEmbedId: null | string;

///////

enum tool {
	nothing,
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}

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
	const activeEmbedId = useSelector((state: GlobalSessionSlice) => state.activeEmbedId);
	const dispatch = useDispatch();
	const [embedId] = useState<string>(crypto.randomUUID());

	
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

	return <>
		<div
			ref = {embedContainerRef}
			className = 'ink_writing-embed'
			style = {{
				// height: '400px',
			}}
		>
			{(!isEditMode && !curPageData.previewUri) && (
				<p>No screenshot yet</p>
			)}
			{/* {(!isEditMode && previewFilePath) && ( */}
			{(!isEditMode && curPageData.previewUri) && (
				<WritingEmbedPreview
					src = {curPageData.previewUri}
					// src = {previewFilePath}
					onClick = {(event) => {
						event.preventDefault();
						dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
					}}
				/>
			)}
			{isEditMode && (
				<TldrawWritingEditor
					plugin = {props.plugin}
					fileRef = {props.fileRef}	// REVIEW: Conver tthis to an open function so the embed controls the open?
					pageData = {curPageData}
					save = {props.save}
					embedded
					registerControls = {registerEditorControls}
				/>
			)}
			{(isActive || isEditMode) && (
				<TransitionMenuBar
					isEditMode = {isEditMode}
					onOpenClick = {async () => {
						openInkFile(props.plugin, props.fileRef)
					}}
					onEditClick = { async () => {
						const newPageData = await refreshPageData();
						setIsEditMode(true);
						setCurPageData(newPageData);
					}}
					onFreezeClick = { async () => {
						await editorControlsRef.current?.saveAndHalt();
						const newPageData = await refreshPageData();
						setCurPageData(newPageData);
						setIsEditMode(false);
					}}
					onDuplicateClick = { async () => {
						await duplicateWritingFile(props.plugin, props.fileRef);
					}}
				/>
			)}
		</div>
	</>;
	

	// Helper functions
	///////////////////

	async function refreshPageData(): Promise<InkFileData> {
		console.log('refreshing pageData');
		const v = props.plugin.app.vault;
		const pageDataStr = await v.read(props.fileRef);
		const pageData = JSON.parse(pageDataStr) as InkFileData;
		return pageData;
	}

	function applyPostMountSettings(editor: Editor) {
		editor.updateInstanceState({
			isDebugMode: false,
			// isGridMode: false,
			canMoveCamera: false,
		})
	}

	function zoomToPageWidth(editor: Editor) {
		const pageBounds = editor.currentPageBounds;
		if(pageBounds) {
			// REVIEW: This manipulations are a hack because I don't know how to get it to zoom exactly to the bounds rather than adding buffer
			pageBounds.x /= 3.5;
			pageBounds.y *= 2.3;
			pageBounds.w /= 2;
			pageBounds.h /= 2;
			editor.zoomToBounds(pageBounds);
		} else {
			console.log('zooming to FIT')
			editor.zoomToFit();
		}
	}
	
};

export default WritingEmbed;




const WritingEmbedPreview: React.FC<{ 
	src: string,
	onClick: React.MouseEventHandler
}> = (props) => {

	return <div>
		<img
			onClick = {props.onClick}
			src = {props.src}
			style = {{
				width: '100%'
			}}
		/>
	</div>

};


const fetchTranscriptIfNeeded = (plugin: InkPlugin, fileRef: TFile, pageData: InkFileData): void => {
	if(needsTranscriptUpdate(pageData)) {
		fetchWriteFileTranscript()
			.then((transcript) => {
				saveWriteFileTranscript(plugin, fileRef, transcript)
			})
	}
}



