import { Editor, Tldraw, type TLEditorSnapshot, type TLStoreSnapshot } from "@tldraw/tldraw";
import * as React from "react";

///////
///////

function parseInkTldrawPreviewSnapshot(raw: string): TLEditorSnapshot | TLStoreSnapshot {
	const parsed: unknown = JSON.parse(raw);
	if (!parsed || typeof parsed !== 'object') {
		throw new Error('Invalid tldraw snapshot JSON');
	}
	return parsed as TLEditorSnapshot | TLStoreSnapshot;
}

export function TldrawPagePreview (props: {sourceJson: string}) {
	// const assetUrls = getAssetUrlsByMetaUrl();

	const handleMount = (editor: Editor) => {
		editor.zoomToFit()
		editor.setCameraOptions({
			isLocked: true,
		})
		editor.updateInstanceState({
			isReadonly: true,
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
				snapshot = {parseInkTldrawPreviewSnapshot(props.sourceJson)}
				hideUi = {true}
				onMount = {handleMount}
				// assetUrls = {assetUrls}
			/>
		</div>
	</>;
	
};

export default TldrawPagePreview;