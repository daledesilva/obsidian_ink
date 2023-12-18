import "./drawing-embed.scss";
import { Editor, SerializedStore, TLRecord, Tldraw } from "@tldraw/tldraw";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawDrawingEditor } from "./tldraw-drawing-editor";
import InkPlugin from "../../main";
import { PageData } from "../../utils/page-file";
import { TransitionMenuBar } from "../transition-menu-bar/transition-menu-bar";
import { openInkFileByFilepath } from "src/utils/open-file";
import { TFile } from "obsidian";

///////
///////

enum tool {
	nothing,
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}

export function DrawingEmbed (props: {
	plugin: InkPlugin,
	pageData: PageData,
	filepath: string,
	save: Function,
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const embedContainerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<Editor|null>(null);
	const [activeTool, setActiveTool] = useState<tool>(tool.nothing);
	const [isEditMode, setIsEditMode] = useState<boolean>(false);
	const [curPageData, setCurPageData] = useState<PageData>(props.pageData);


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
					base64Image = {curPageData.previewUri}
				/>
			)}
			{isEditMode && (
				<TldrawDrawingEditor
					plugin = {props.plugin}
					existingData = {curPageData.tldraw}
					filepath = {props.filepath}	// REVIEW: Conver tthis to an open function so the embed controls the open?
					save = {props.save}
					embedded
				/>
			)}
			<TransitionMenuBar
				onOpenClick = {() => openInkFileByFilepath(props.plugin, props.filepath)}
				isEditMode = {isEditMode}
				onEditClick = { async () => {
					const newPageData = await refreshPageData();
					setIsEditMode(true);
					setCurPageData(newPageData);
				}}
				onFreezeClick = { async () => {
					const newPageData = await refreshPageData();
					setIsEditMode(false);
					setCurPageData(newPageData);
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
	base64Image: string,
}> = (props) => {

	return <div>
		<img
			src = {props.base64Image}
			style = {{
				width: '100%'
			}}
		/>
	</div>

};




