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
	const previousHeightRef = useRef<number | null>(null);
	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)
	// const [embedId] = useState<string>(nanoid());
	// const activeEmbedId = useSelector((state: GlobalSessionState) => state.activeEmbedId);
	// const dispatch = useDispatch();

	const setEmbedState = useSetAtom(embedStateAtom);
	
	// Calculate initial height from aspectRatio for JSX styles
	// Use a default width (700px) that matches typical CodeMirror content width
	// The actual width will be determined by the container, and resize callbacks will update height
	const defaultInitialWidth = 700;
	const initialHeight = defaultInitialWidth / embedAspectRatioRef.current;
	
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
				style = {{
					width: '100%',
					height: initialHeight + 'px',
				}}
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
		
		// Only call onRequestMeasure if height actually changed (within 1px threshold for rounding)
		const heightChanged = previousHeightRef.current === null || Math.abs(height - previousHeightRef.current) > 1;
		
		resizeContainerElRef.current.style.height = height + 'px';
		previousHeightRef.current = height;
		
		// Notify CodeMirror to re-measure only when height actually changes
		if (heightChanged) {
			props.onRequestMeasure?.();
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
