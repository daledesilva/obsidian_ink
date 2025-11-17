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
import type { Box } from "@tldraw/tldraw";

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
	onRequestMeasure?: () => void,
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
					onResize = {(height: number) => applySizingWhilePreviewing(height)}
					writingFile = {props.writingFileRef}
					onClick = {async (event) => {
						// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
						// setPageData( await refreshPageData(props.plugin, props.fileRef) );
						switchToEditMode();
					}}
				/>

				<TldrawWritingEditorWrapper
					plugin = {props.plugin} // TODO: Try and remove this
					onResize = {(invitingBounds, tightBounds) => applySizingWhileEditing(invitingBounds, tightBounds)}
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

	function applySizingWhilePreviewing(height: number) {
		if (!height) return;
		if(!resizeContainerElRef.current) return;

		applyHeight(height);
		// DO NOT recalculate embedAspectRatioRef here - editor is authoritative source
	}

	function applySizingWhileEditing(invitingBounds: Box, tightBounds: Box) {
		if(!resizeContainerElRef.current) return;
		const containerWidth = resizeContainerElRef.current.getBoundingClientRect().width;
		if (!containerWidth) return;

		// Apply editor display height (inviting bounds for editing experience)
		const editorRatio = invitingBounds?.w && invitingBounds?.h ? invitingBounds.w / invitingBounds.h : null;
		if (editorRatio && isFinite(editorRatio) && editorRatio > 0) {
			const editorHeight = containerWidth / editorRatio;
			applyHeight(editorHeight);
		}

		// Store tight aspect ratio for preview (used when switching to preview mode)
		const previewRatio = tightBounds?.w && tightBounds?.h ? tightBounds.w / tightBounds.h : null;
		if (previewRatio && isFinite(previewRatio) && previewRatio > 0) {
			embedAspectRatioRef.current = previewRatio;
		}
	}

	function applyHeight(height: number) {
		if(!resizeContainerElRef.current) return;
		resizeContainerElRef.current.style.height = height + 'px';
		
		// Notify CodeMirror to re-measure when height changes
		props.onRequestMeasure?.();
		
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

		// Apply preview height immediately based on tight aspectRatio before switching modes
		if (resizeContainerElRef.current && embedAspectRatioRef.current) {
			const containerWidth = resizeContainerElRef.current.getBoundingClientRect().width;
			if (containerWidth) {
				const previewHeight = containerWidth / embedAspectRatioRef.current;
				applyHeight(previewHeight);
			}
		}

		setEmbedState(WritingEmbedState.loadingPreview);
		
		// Persist the aspectRatio to markdown
		if (props.setEmbedProps) {
			props.setEmbedProps(embedAspectRatioRef.current);
		}
	}
	
};

export default WritingEmbed;
