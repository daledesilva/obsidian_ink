import { Editor, SerializedStore, TLEventInfo, TLRecord, TLShape, TLUiEventHandler, TLUiOverrides, Tldraw, UiEvent, toolbarItem } from "@tldraw/tldraw";
import * as React from "react";
import { useCallback, useRef, PointerEventHandler, useEffect } from "react";
import { initCamera, preventTldrawCanvasesCausingObsidianGestures } from "src/utils/helpers";
import HandwritingContainer from "./shapes/handwriting-container"

///////
///////

const MyCustomShapes = [HandwritingContainer];

const myOverrides: TLUiOverrides = {
	toolbar(_app, toolbar, { tools }) {
		const reducedToolbar = [
			toolbar[0],
			toolbar[2],
			toolbar[3]
		]
		return reducedToolbar;
	},
}


export function TldrawViewEditor (props: {
	existingData: SerializedStore<TLRecord>,
	uid: string,
	save: Function,
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const containerRef = useRef<HTMLDivElement>(null)
	const [outputLog, setOutputLog] = React.useState('This is the output log');

	const handleMount = (editor: Editor) => {

		// const allRecords = editor.store.allRecords();
		// const containers = allRecords.filter( (record: any) => {
		// 	return record?.type === 'handwriting-container'
		// })
		// if(!containers.length) {
		// 	editor.createShapes([{ type: 'handwriting-container' }]);
		// }

		initCamera(editor);
		editor.updateInstanceState({
			isDebugMode: false,
		})

		editor.store.listen((entry) => {
			// console.log('entry', entry);
			// entry // { changes, source }
			// REVIEW: Mouse moves fire this too, so it would be good to filter this to only save if it's a save-worthy change
			const contents = editor.store.getSnapshot();
			props.save(contents);
			if(containerRef.current) {
				console.log('containerRef.innerWidth', containerRef.current.innerWidth);
			}
		})

		preventTldrawCanvasesCausingObsidianGestures();
	}

	return <>
		<div
			ref = {containerRef}
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
				overrides = {myOverrides}
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




