import "./writing-embed.scss";
import * as React from "react";
import { useRef } from "react";
import { TldrawWritingEditorWrapper } from "../tldraw-writing-editor/tldraw-writing-editor";
import InkPlugin from "src/main";
import { InkFileData } from "src/components/formats/current/types/file-data";
import { rememberWritingFile } from "src/logic/utils/rememberDrawingFile";
import { embedShouldActivateImmediately } from "src/logic/utils/storage";
import { verbose } from "src/logic/utils/log-to-console";
import { TFile } from "obsidian";
import { WritingEmbedPreviewWrapper } from "../writing-embed-preview/writing-embed-preview";
import classNames from "classnames";
import { atom, useSetAtom } from "jotai";
import { EmbedSettings, DEFAULT_EMBED_SETTINGS } from "src/types/embed-settings";
import { WRITING_LINE_HEIGHT } from "src/constants";

///////
///////


export enum WritingEmbedState {
	preview = 'preview',
	loadingEditor = 'loadingEditor',
	editor = 'editor',
	loadingPreview = 'unloadingEditor',
}
export const embedStateAtom = atom(WritingEmbedState.preview)
export const previewActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== WritingEmbedState.editor
})
export const editorActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== WritingEmbedState.preview
})

///////

export type WritingEditorControls = {
	save: Function,
	saveAndHalt: Function,
}

export function WritingEmbed (props: {
	plugin: InkPlugin,
	writingFileRef: TFile,
    pageData?: InkFileData,
	embedSettings?: EmbedSettings,
    save: (pageData: InkFileData) => void,
	remove: Function,
	setEmbedProps?: (aspectRatio: number) => void,
	onHeightChange?: (height: number) => void,
}) {
	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	const editorControlsRef = useRef<WritingEditorControls>();
	const embedAspectRatioRef = useRef<number>(props.embedSettings?.embedDisplay?.aspectRatio || DEFAULT_EMBED_SETTINGS.embedDisplay.aspectRatio);
	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)
	// const [embedId] = useState<string>(nanoid());
	// const activeEmbedId = useSelector((state: GlobalSessionState) => state.activeEmbedId);
	// const dispatch = useDispatch();

	const setEmbedState = useSetAtom(embedStateAtom);
	
	// Set initial height based on aspectRatio to prevent layout shift
	React.useEffect(() => {
		if (resizeContainerElRef.current && embedAspectRatioRef.current) {
			const currentWidth = resizeContainerElRef.current.getBoundingClientRect().width;
			if (currentWidth) {
				const estimatedHeight = currentWidth / embedAspectRatioRef.current;
				resizeContainerElRef.current.style.height = estimatedHeight + 'px';
			}
		}
	}, []);
	
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
			
				<WritingEmbedPreviewWrapper
					plugin = {props.plugin}
					onResize = {(height: number) => resizeContainer(height)}
					writingFile = {props.writingFileRef}
					onClick = {async (event) => {
						// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
						// setPageData( await refreshPageData(props.plugin, props.fileRef) );
						switchToEditMode();
					}}
				/>

				<TldrawWritingEditorWrapper
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

	function registerEditorControls(handlers: WritingEditorControls) {
		editorControlsRef.current = handlers;
	}

	function resizeContainer(height: number) {
		if(!resizeContainerElRef.current) return;
		resizeContainerElRef.current.style.height = height + 'px';
		
		// Calculate and update aspectRatio based on current width and new height
		const currentWidth = resizeContainerElRef.current.getBoundingClientRect().width;
		if (currentWidth && height) {
			embedAspectRatioRef.current = currentWidth / (height - WRITING_LINE_HEIGHT*2);
		}
		
		// Notify parent widget of height change immediately (no latency)
		if (props.onHeightChange) {
			props.onHeightChange(height);
		}
		
		setTimeout( () => {
			// Applies after slight delay so it doesn't affect the first resize
			if(!resizeContainerElRef.current) return;
			resizeContainerElRef.current.classList.add('ddc_ink_smooth-transition');
		}, 100)
	}

	function switchToEditMode() {
		verbose('Set WritingEmbedState: loadingEditor')
		setEmbedState(WritingEmbedState.loadingEditor);
	}
	
	async function saveAndSwitchToPreviewMode() {
		verbose('Set WritingEmbedState: loadingPreview');

		if(editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}

		setEmbedState(WritingEmbedState.loadingPreview);
		
		// Persist the aspectRatio to markdown
		if (props.setEmbedProps) {
			props.setEmbedProps(embedAspectRatioRef.current);
		}
	}
	
};

export default WritingEmbed;
