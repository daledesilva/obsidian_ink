import { Editor, SerializedStore, TLRecord, Tldraw } from "@tldraw/tldraw";
import * as React from "react";
import { useRef, useEffect } from "react";

///////
///////

export function TldrawEmbedEditor (props: {
	existingData: SerializedStore<TLRecord>,
	uid: string,
	save: Function,
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const embedContainerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<Editor|null>(null);

	const handleMount = (editor: Editor) => {
		editorRef.current = editor;
		applyPostMountSettings(editor);
		zoomToPageWidth(editor);
		fitEmbedToContent(editor);
		editor.setCurrentTool('draw');
		initListeners(editor);
	}

	useEffect(() => {
		
	}, []);

	return <>
		<div
			ref = {embedContainerRef}
			style = {{
				height: '400px',
			}}
		>
			<Tldraw
				// TODO: Try converting snapshot into store: https://tldraw.dev/docs/persistence#The-store-prop
				snapshot = {props.existingData}	// NOTE: Check what's causing this snapshot error??
				// persistenceKey = {props.uid}
				onMount = {handleMount}
				// assetUrls = {assetUrls}
				// hideUi = {true}
			/>
		</div>
	</>;

	// Helper functions
	///////////////////

	function applyPostMountSettings(editor: Editor) {
		editor.updateInstanceState({
			isDebugMode: false,
			// isGridMode: false,
			// canMoveCamera: false,
		})
	}

	function zoomToPageWidth(editor: Editor) {
		const pageBounds = editor.currentPageBounds;
		if(pageBounds) {
			// REVIEW: This manipulations are a hack because I don't know how to get it to zoom exactly to the bounds rather than adding buffer
			pageBounds.x /= 4;
			pageBounds.y /= 4;
			pageBounds.w /= 2;
			pageBounds.h /= 2;
			editor.zoomToBounds(pageBounds);
		} else {
			console.log('zooming to FIT')
			editor.zoomToFit();
		}
	}

	function fitEmbedToContent(editor: Editor) {
		const embedBounds = editor.viewportScreenBounds;
		const contentBounds = editor.currentPageBounds;
		if(contentBounds) {
			const contentRatio = contentBounds.w / contentBounds.h
			const embedHeight = embedBounds.w / contentRatio;
			if(embedContainerRef.current) {
				embedContainerRef.current.style.height = embedHeight + 'px';
			}
		}
	}

	function initListeners(editor: Editor) {
		editor.store.listen((entry) => {
			// REVIEW: Mouse moves fire this too, so it would be good to filter this to only save if it's a save-worthy change
			fitEmbedToContent(editor);
			const contents = editor.store.getSnapshot();
			props.save(contents);
		})
	}
	
};

export default TldrawEmbedEditor;




