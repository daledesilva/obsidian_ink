import "./handwritten-embed.scss";
import { Editor, SerializedStore, TLRecord, Tldraw } from "@tldraw/tldraw";
import * as React from "react";
import { useRef, useState } from "react";
import TldrawHandwrittenEditor from "./tldraw-handwritten-editor";
import HandwritePlugin from "../../main";
import { PageData } from "../../utils/page-file";
import ReadonlyMenuBar from "../readonly-menu-bar/readonly-menu-bar";

///////
///////

enum tool {
	nothing,
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}

export function HandwrittenEmbed (props: {
	plugin: HandwritePlugin,
	pageData: PageData,
	filepath: string,
	save: Function,
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const embedContainerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<Editor|null>(null);
	const [activeTool, setActiveTool] = useState<tool>(tool.nothing);
	const [isEditMode, setIsEditMode] = useState<boolean>(false);

	return <>
		<div
			ref = {embedContainerRef}
			className = 'ink_handwritten-embed'
			style = {{
				// height: '400px',
			}}
		>
			{(!isEditMode && props.pageData.previewUri) ? (
				<HandwrittenEmbedPreview
					base64Image = {props.pageData.previewUri}
					onEditClick = {() => {
						console.log('going to edit mode');
						setIsEditMode(true)
					}}
				/>
			) : (
				<TldrawHandwrittenEditor
					plugin = {props.plugin}
					existingData = {props.pageData.tldraw}
					filepath = {props.filepath}	// REVIEW: Conver tthis to an open function so the embed controls the open?
					save = {props.save}
					embedded
				/>
			)}
		</div>
	</>;

	// Helper functions
	///////////////////

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

export default HandwrittenEmbed;




const HandwrittenEmbedPreview: React.FC<{ 
	base64Image: string,
	onEditClick: Function,
}> = (props) => {

	return <div>
		<img
			src = {props.base64Image}
			style = {{
				width: '100%'
			}}
		/>
		<ReadonlyMenuBar
			onEditClick = {() => props.onEditClick()}
		/>
	</div>

};




