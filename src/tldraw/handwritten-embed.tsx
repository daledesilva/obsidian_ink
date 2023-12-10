import { Editor, SerializedStore, TLRecord, Tldraw } from "@tldraw/tldraw";
import * as React from "react";
import { useRef, useState } from "react";
import TldrawHandwrittenEditor from "./tldraw-handwritten-editor";
import HandwritePlugin from "src/main";

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
	existingData: SerializedStore<TLRecord>,
	filepath: string,
	save: Function,
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const embedContainerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<Editor|null>(null);
	const [activeTool, setActiveTool] = useState<tool>(tool.nothing);

	const handleMount = (editor: Editor) => {
		// editorRef.current = editor;
		// zoomToPageWidth(editor);
		// activateDrawTool();
		// initListeners(editor);
		// applyPostMountSettings(editor);
	}

	return <>
		{/* <div className = 'ink_embed-controls'> */}
			{/* <button
				onClick = {activateDrawTool}
				disabled = {activeTool===tool.draw}
				>
				Write
			</button>
			<button
				onClick = {activateEraserTool}
				disabled = {activeTool===tool.eraser}
				>
				Eraser
			</button>
			<button
				onClick = {activateSelectTool}
				disabled = {activeTool===tool.select}
				>
				Select
			</button>
		</div> */}
		<div
			ref = {embedContainerRef}
			style = {{
				height: '400px',
			}}
		>
			{/* <Tldraw
				// TODO: Try converting snapshot into store: https://tldraw.dev/docs/persistence#The-store-prop
				snapshot = {props.existingData}	// NOTE: Check what's causing this snapshot error??
				// persistenceKey = {props.filepath}
				onMount = {handleMount}
				// assetUrls = {assetUrls}
				hideUi = {true}
			/> */}
			<TldrawHandwrittenEditor
				plugin = {props.plugin}
                existingData = {props.existingData}
                filepath = {props.filepath}
                save = {props.save}
				embedded
				resizeContainer = {resizeEmbed}
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




