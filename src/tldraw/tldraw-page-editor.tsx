import { Editor, Tldraw } from "@tldraw/tldraw";
import * as React from "react";

///////
///////

export function TldrawPageEditor (props: {sourceJson: string}) {
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
                position: 'absolute',
				width: '100%',
				height: '100%'
			}}
		>
			<Tldraw
				snapshot = {JSON.parse(props.sourceJson)}
				onMount = {handleMount}
				// assetUrls = {assetUrls}
			/>
		</div>
	</>;
	
};

export default TldrawPageEditor;




