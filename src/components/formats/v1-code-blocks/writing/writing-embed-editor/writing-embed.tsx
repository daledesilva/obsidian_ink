import "./writing-embed.scss";
import * as React from "react";
import { useRef } from "react";
import { TldrawWritingEditorWrapper_v1 } from "../tldraw-writing-editor/tldraw-writing-editor";
import InkPlugin from "src/main";
import { InkFileData_v1 } from "src/components/formats/v1-code-blocks/types/file-data";
import { rememberWritingFile } from "src/logic/utils/rememberDrawingFile";
import { embedShouldActivateImmediately } from "src/logic/utils/storage";
import { verbose } from "src/logic/utils/log-to-console";
import { TFile } from "obsidian";
import { WritingEmbedPreviewWrapper_v1 } from "../writing-embed-preview/writing-embed-preview";
import classNames from "classnames";
import { atom, useSetAtom } from "jotai";

///////
///////


export enum WritingEmbedState_v1 {
	preview = 'preview',
	loadingEditor = 'loadingEditor',
	editor = 'editor',
	loadingPreview = 'unloadingEditor',
}
export const embedStateAtom_v1 = atom(WritingEmbedState_v1.preview)
export const previewActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom_v1);
	return embedState !== WritingEmbedState_v1.editor
})
export const editorActiveAtom_v1 = atom<boolean>((get) => {
	const embedState = get(embedStateAtom_v1);
	return embedState !== WritingEmbedState_v1.preview
})

///////

export type WritingEditorControls_v1 = {
	save: Function,
	saveAndHalt: Function,
}

export function WritingEmbed_v1 (props: {
	plugin: InkPlugin,
	writingFileRef: TFile,
	pageData: InkFileData_v1,
	save: (pageData: InkFileData_v1) => void,
	remove: Function,
}) {
	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	const editorControlsRef = useRef<WritingEditorControls_v1>();
	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)
	// const [embedId] = useState<string>(nanoid());
	// const activeEmbedId = useSelector((state: GlobalSessionState) => state.activeEmbedId);
	// const dispatch = useDispatch();

	const setEmbedState = useSetAtom(embedStateAtom_v1);
	
	// On first mount
	React.useEffect( () => {
		//console.log('EMBED mounted')
		if(embedShouldActivateImmediately()) {
			// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
			setTimeout( () => {
				switchToEditMode();
			},200);	// TODO: Why is there a delay?
		}
	}, [])

	// Whenever switching between readonly and edit mode
	// React.useEffect( () => {
	// 	if(embedState === EmbedState.preview) {
	// 		fetchTranscriptIfNeeded(props.plugin, props.fileRef, curPageData.current);
	// 	}
	// }, [embedState])

	// let isActive = (embedId === activeEmbedId);
	// if(!isActive && state === 'edit'){
	// 	saveAndSwitchToPreviewMode();
	// }

	const commonExtendedOptions = [
		{
			text: 'Copy writing',
			action: async () => {
				await rememberWritingFile(props.plugin, props.writingFileRef);
			}
		},
		// {
		// 	text: 'Open writing',
		// 	action: async () => {
		// 		openInkFile(props.plugin, props.fileRef)
		// 	}
		// },
		{
			text: 'Remove embed',
			action: () => {
				props.remove()
			},
		},
	]

	////////////

	return <>		
		<div
			ref = {embedContainerElRef}
			className = {classNames([
				'ddc_ink_embed',
				'ddc_ink_writing-embed',
			])}
			style = {{
				// Must be padding as margin creates codemirror calculation issues
				paddingTop: '1em',
				paddingBottom: '0.5em',
			}}
		>
			{/* Include another container so that it's height isn't affected by the padding of the outer container */}
			<div
				className = 'ddc_ink_resize-container'
				ref = {resizeContainerElRef}
			>
			
				<WritingEmbedPreviewWrapper_v1
					plugin = {props.plugin}
					onResize = {(height: number) => resizeContainer(height)}
					writingFile = {props.writingFileRef}
					onClick = {async (event) => {
						// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
						// setPageData( await refreshPageData(props.plugin, props.fileRef) );
						switchToEditMode();
					}}
				/>

				<TldrawWritingEditorWrapper_v1
					plugin = {props.plugin} // TODO: Try and remove this
					onResize = {(height: number) => resizeContainer(height)}
					writingFile = {props.writingFileRef}
					save = {props.save}
					embedded
					saveControlsReference = {registerEditorControls}
					closeEditor = {saveAndSwitchToPreviewMode}
					extendedMenu = {commonExtendedOptions}
				/>

			</div>

		</div>
	</>;
	
	// Helper functions
	///////////////////

	function registerEditorControls(handlers: WritingEditorControls_v1) {
		editorControlsRef.current = handlers;
	}

	function resizeContainer(height: number) {
		if(!resizeContainerElRef.current) return;
		resizeContainerElRef.current.style.height = height + 'px';
		setTimeout( () => {
			// Applies after slight delay so it doesn't affect the first resize
			if(!resizeContainerElRef.current) return;
			resizeContainerElRef.current.classList.add('ddc_ink_smooth-transition');
		}, 100)
	}

	function switchToEditMode() {
		verbose('Set WritingEmbedState: loadingEditor')
		setEmbedState(WritingEmbedState_v1.loadingEditor);
	}
	
	async function saveAndSwitchToPreviewMode() {
		verbose('Set WritingEmbedState: loadingPreview');

		if(editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}

		setEmbedState(WritingEmbedState_v1.loadingPreview);
	}
	
};