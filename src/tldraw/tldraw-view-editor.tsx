import { Editor, SerializedStore, TLEventInfo, TLRecord, TLUiEventHandler, Tldraw, UiEvent } from "@tldraw/tldraw";
import * as React from "react";
import { useCallback, useRef, PointerEventHandler, useEffect } from "react";
import { preventTldrawCanvasesCausingObsidianGestures } from "src/utils/helpers";
import HandwritingContainer from "./shapes/handwriting-container"

///////
///////

const MyCustomShapes = [HandwritingContainer]

export function TldrawViewEditor (props: {
	existingData: SerializedStore<TLRecord>,
	uid: string,
	save: Function,
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const containerRef = useRef<HTMLDivElement>(null)
	const [outputLog, setOutputLog] = React.useState('This is the output log');

	const handleMount = (editor: Editor) => {
		editor.zoomToFit()
		editor.updateInstanceState({
			isDebugMode: false,
		})

		editor.createShapes([{ type: 'handwriting-container' }])

		editor.store.listen((entry) => {
			// console.log('entry', entry);
			// entry // { changes, source }
			// REVIEW: Mouse moves fire this too, so it would be good to filter this to only save if it's a save-worthy change
			const contents = editor.store.getSnapshot();
			props.save(contents);
		})

		preventTldrawCanvasesCausingObsidianGestures();
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
				shapeUtils = {MyCustomShapes}
			/>
			<div
				className = 'output-log'
				style = {{
					position: 'absolute',
					bottom: '60px',
					left: '50%',
					transform: 'translate(-50%, 0)',
					zIndex: 10000,
					backgroundColor: '#000',
					padding: '0.5em 1em'
				}}
				>
					<p>Output Log:</p>
				{outputLog}
			</div>
		</div>
	</>;
	
};

export default TldrawViewEditor;




