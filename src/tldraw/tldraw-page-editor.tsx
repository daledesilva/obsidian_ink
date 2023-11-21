import { Editor, SerializedStore, TLRecord, Tldraw } from "@tldraw/tldraw";
import * as React from "react";

///////
///////

export function TldrawPageEditor (props: {existingData: SerializedStore<TLRecord>}) {
	// const assetUrls = getAssetUrlsByMetaUrl();

	const handleMount = (editor: Editor) => {
		editor.zoomToFit()
		editor.updateInstanceState({
			// isDebugMode: false,
		})
	}

	return <>
		<div
			style = {{
				height: '100%'
			}}
		>
			<Tldraw
				snapshot = {props.existingData}	// REVIEW: Check what's causing this snapshot error
				onMount = {handleMount}
				// assetUrls = {assetUrls}
			/>
		</div>
	</>;
	
};

export default TldrawPageEditor;




