import "./drawing-embed.scss";
import { Editor, SerializedStore, TLRecord, Tldraw } from "@tldraw/tldraw";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawDrawingEditor } from "./tldraw-drawing-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { TransitionMenuBar } from "../transition-menu-bar/transition-menu-bar";
import { openInkFile } from "src/utils/open-file";
import { Notice, TFile } from "obsidian";
import { duplicateDrawingFile, duplicateWritingFile, getPreviewFileResourcePath, getPreviewFileVaultPath } from "src/utils/file-manipulation";
import { isEmptyDrawingFile, removeExtensionAndDotFromFilepath } from "src/utils/helpers";

///////
///////

enum tool {
	nothing,
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}


export type DrawingEditorControls = {
	save: Function,
	saveAndHalt: Function,
}

export function DrawingEmbed (props: {
	plugin: InkPlugin,
	pageData: InkFileData,
	fileRef: TFile,
	save: (pageData: InkFileData) => {},
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const embedContainerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<Editor|null>(null);
	const [activeTool, setActiveTool] = useState<tool>(tool.nothing);
	const [isEditMode, setIsEditMode] = useState<boolean>(false);
	const isEditModeForScreenshottingRef = useRef<boolean>(false);
	const [curPageData, setCurPageData] = useState<InkFileData>(props.pageData);
	const editorControlsRef = useRef<DrawingEditorControls>();

		
	// Whenever switching between readonly and edit mode
	React.useEffect( () => {

		if(!isEditMode) {
			if(isEmptyDrawingFile(props.pageData.tldraw)) {
				setIsEditMode(true);
				
			} else if(!curPageData.previewUri) {
				console.log("Switching to edit mode for drawing screenshot")
				setIsEditMode(true);
				isEditModeForScreenshottingRef.current = true;
			}

		}		

	}, [isEditMode])

	// This fires the first time it enters edit mode
	const registerEditorControls = (handlers: DrawingEditorControls) => {
		editorControlsRef.current = handlers;
		
		// Run mount actions for edit mode here to ensure editorControls is available
		if(isEditModeForScreenshottingRef.current) takeScreenshotAndReturn();
	}

	const takeScreenshotAndReturn = async () => {
		console.log('Taking drawing screenshot and switching back to read-only mode');
		if(!editorControlsRef.current) return;
		isEditModeForScreenshottingRef.current = false;
		
		await editorControlsRef.current.saveAndHalt();
		const newPageData = await refreshPageData();
		setCurPageData(newPageData);
		setIsEditMode(false);
	}



	
	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)

	return <>
		<div
			ref = {embedContainerRef}
			className = 'ink_drawing-embed'
			style = {{
				height: isEditMode ? '600px' : 'auto',
			}}
		>
			{(!isEditMode && !curPageData.previewUri) && (
				<p>No screenshot yet</p>
			)}
			{/* {(!isEditMode && previewFilePath) && ( */}
			{(!isEditMode && curPageData.previewUri) && (
				<DrawingEmbedPreview
					src = {curPageData.previewUri}
					// src = {previewFilePath}
				/>
			)}
			{isEditMode && (
				<TldrawDrawingEditor
					plugin = {props.plugin}
					fileRef = {props.fileRef}	// REVIEW: Conver tthis to an open function so the embed controls the open?
					pageData = {curPageData}
					save = {props.save}
					embedded
					registerControls = {registerEditorControls}
				/>
			)}
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
					await editorControlsRef.current?.save();
					setIsEditMode(false);
					const newPageData = await refreshPageData();
					setCurPageData(newPageData);
				}}
				onDuplicateClick = { async () => {
					await duplicateWritingFile(props.plugin, props.fileRef);
				}}
			/>
		</div>
	</>;

	// Helper functions
	///////////////////

	async function refreshPageData(): Promise<InkFileData> {
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

export default DrawingEmbed;




const DrawingEmbedPreview: React.FC<{ 
	src: string,
}> = (props) => {

	return <div>
		<img
			src = {props.src}
			style = {{
				width: '100%'
			}}
		/>
	</div>

};




