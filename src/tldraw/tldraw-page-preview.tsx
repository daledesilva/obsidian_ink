import { Editor, Tldraw } from "@tldraw/tldraw";
import * as React from "react";

///////
///////

export function TldrawPagePreview (props: {sourceJson: string}) {
	// const assetUrls = getAssetUrlsByMetaUrl();

	const handleMount = (editor: Editor) => {
		editor.zoomToFit()
		editor.updateInstanceState({
			isReadonly: true,
			canMoveCamera: false,
			isToolLocked: true,
			isDebugMode: false,
		})
	}

	return <>
		<div
			className = 'block-widget external-styling'
			style = {{
				height: '500px'
			}}
		>
			<Tldraw
				snapshot = {JSON.parse(props.sourceJson)}
				hideUi = {true}
				onMount = {handleMount}
				// assetUrls = {assetUrls}
			/>
		</div>
	</>;
	
};

export default TldrawPagePreview;