import { Editor, SerializedStore, TLRecord, Tldraw } from "@tldraw/tldraw";
import * as React from "react";
import { useRef, useState } from "react";
import TldrawHandwrittenEditor from "./tldraw-handwritten-editor";
import HandwritePlugin from "src/main";

///////
///////

import "./handwritten-embed.scss";
import { PageData } from "src/utils/page-file";
import { HandwrittenEmbedData } from "src/utils/embed";

enum tool {
	nothing,
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}

export function HandwrittenEmbed (props: {
	plugin: HandwritePlugin,
	existingData: SerializedStore<TLRecord>,
	embedData: HandwrittenEmbedData,
	save: Function,
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const embedContainerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<Editor|null>(null);
	const [activeTool, setActiveTool] = useState<tool>(tool.nothing);

	return <>
		<div
			ref = {embedContainerRef}
			className = 'ink_handwritten-embed'
			style = {{
				// height: '400px',
			}}
		>
			{/* <img src={props.existingData.previewUri}/> */}
			<TldrawHandwrittenEditor
				plugin = {props.plugin}
                existingData = {props.existingData}
                filepath = {props.embedData.filepath}
                save = {props.save}
				embedded
				resizeEmbedContainer = {resizeEmbed}
			/>
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

	function resizeEmbed(pxHeight: number) {
		if(embedContainerRef.current) {
			embedContainerRef.current.style.height = pxHeight + 'px';
		}
	}
	
};

export default HandwrittenEmbed;




