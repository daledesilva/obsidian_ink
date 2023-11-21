import { Editor, Tldraw } from "@tldraw/tldraw";
import * as React from "react";

///////
///////

export function TldrawPageEditor (props: {sourceJsonStr: string}) {
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
				snapshot = {JSON.parse(props.sourceJsonStr)}
				onMount = {handleMount}
				// assetUrls = {assetUrls}
			/>
		</div>
	</>;
	
};

export default TldrawPageEditor;




