import { Editor, SerializedStore, TLRecord, Tldraw } from "@tldraw/tldraw";
import * as React from "react";

///////
///////

export function TldrawPageEditor (props: {
	existingData: SerializedStore<TLRecord>,
	uid: string,
	save: Function,
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();

	const handleMount = (editor: Editor) => {
		editor.zoomToFit()
		editor.updateInstanceState({
			// isDebugMode: false,
		})
		editor.store.listen((entry) => {
			// console.log('entry', entry);
			// entry // { changes, source }
			// REVIEW: Mouse moves fire this too, so it would be good to filter this to only save if it's a save-worthy change
			const contents = editor.store.getSnapshot();
			props.save(contents);
		})
	}

	return <>
		<div
			style = {{
				height: '100%',
			}}
		>
			<Tldraw
				// TODO: Try converting snapshot into store: https://tldraw.dev/docs/persistence#The-store-prop
				snapshot = {props.existingData}	// NOTE: Check what's causing this snapshot error??
				// persistenceKey = {props.uid}
				onMount = {handleMount}
				// assetUrls = {assetUrls}
			/>
		</div>
	</>;
	
};

export default TldrawPageEditor;




