import "./drawing-embed.scss";
import { Editor, SerializedStore, TLRecord, Tldraw } from "@tldraw/tldraw";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawDrawingEditor } from "./tldraw-drawing-editor";
import InkPlugin from "../../main";
import { PageData } from "../../utils/page-file";
import { TransitionMenuBar } from "../transition-menu-bar/transition-menu-bar";
import { openInkFileByFilepath } from "src/utils/open-file";
import { Notice, TFile } from "obsidian";
import { duplicateDrawingFile } from "src/utils/file-manipulation";
import { removeExtensionAndDotFromFilepath } from "src/utils/helpers";

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
}

export function DrawingEmbed (props: {
	plugin: InkPlugin,
	pageData: PageData,
	filepath: string,
	save: (pageData: PageData) => {},
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const embedContainerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<Editor|null>(null);
	const [activeTool, setActiveTool] = useState<tool>(tool.nothing);
	const [isEditMode, setIsEditMode] = useState<boolean>(false);
	const [isEditModeForScreenshotting, setIsEditModeForScreenshotting] = useState<boolean>(false);
	const [curPageData, setCurPageData] = useState<PageData>(props.pageData);
	const editorControlsRef = useRef<DrawingEditorControls>();

	// If it's not in edit mode, but doesn't have a screenshot to show, send it to edit mode to get one
	if(!isEditMode && !curPageData.previewUri) {
		console.log('found to have no preview')
		
		// TODO: If the file is empty, then just default straight to edit mode
		setIsEditMode(true);
		
		// TODO: If it's been edit, or the dark mode has changed, then go to edit mode just to create the screenshot and then come straight back
		setIsEditMode(true);
		setIsEditModeForScreenshotting(true);
	}

	// This fires the first time it enters edit mode
	const registerEditorControls = (handlers: DrawingEditorControls) => {
		editorControlsRef.current = handlers;
		console.log('registering controls');
		if(isEditModeForScreenshotting) takeScreenshotAndReturn();
	}

	const takeScreenshotAndReturn = async () => {
		if(!editorControlsRef.current) return;

		console.log('taking screenshot');
		await editorControlsRef.current.save();

		console.log('leaving edit mode');
		const newPageData = await refreshPageData();
		setCurPageData(newPageData);
		setIsEditMode(false);
		setIsEditModeForScreenshotting(false);
	}

	

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
			{(!isEditMode && curPageData.previewUri) && (
				<DrawingEmbedPreview
					src = {curPageData.previewUri}
					// src = {removeExtensionAndDotFromFilepath(props.filepath) + '.png'}
				/>
			)}
			{isEditMode && (
				<TldrawDrawingEditor
					plugin = {props.plugin}
					filepath = {props.filepath}	// REVIEW: Conver tthis to an open function so the embed controls the open?
					pageData = {curPageData}
					save = {props.save}
					embedded
					registerControls = {registerEditorControls}
				/>
			)}
			<TransitionMenuBar
				isEditMode = {isEditMode}
				onOpenClick = {async () => {
					await editorControlsRef.current?.save();
					openInkFileByFilepath(props.plugin, props.filepath)
				}}
				onEditClick = { async () => {
					const newPageData = await refreshPageData();
					setIsEditMode(true);
					setCurPageData(newPageData);
				}}
				onFreezeClick = { async () => {
					await editorControlsRef.current?.save();
					const newPageData = await refreshPageData();
					setIsEditMode(false);
					setCurPageData(newPageData);
				}}
				onDuplicateClick = { async () => {
					await editorControlsRef.current?.save();
					await duplicateDrawingFile(props.plugin, props.filepath);
					new Notice("File duplicated");
				}}
			/>
		</div>
	</>;

	// Helper functions
	///////////////////

	async function refreshPageData(): Promise<PageData> {
		const v = props.plugin.app.vault;
		const file = v.getAbstractFileByPath(props.filepath);
		if(!(file instanceof TFile)) return props.pageData;
		const pageDataStr = await v.read(file);
		const pageData = JSON.parse(pageDataStr) as PageData;
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




