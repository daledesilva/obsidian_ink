import "./writing-embed.scss";
import * as React from "react";
import { useRef } from "react";
import { TldrawWritingEditorWrapper } from "../tldraw-writing-editor/tldraw-writing-editor";
import InkPlugin from "src/main";
import { InkFileData } from "src/components/formats/current/types/file-data";
import { FileConversionModal } from "src/components/dom-components/modals/file-conversion-modal/file-conversion-modal";
import { ConfirmationModal } from "src/components/dom-components/modals/confirmation-modal/confirmation-modal";
import { openRemoveEmbedFlow } from "src/logic/utils/remove-embed-flow";
import { openInkFile } from "src/logic/utils/open-file";
import { embedShouldActivateImmediately } from "src/logic/utils/storage";
import { verbose } from "src/logic/utils/log-to-console";
import { logToVault } from "src/logic/utils/log-to-vault";
import { TFile } from "obsidian";
import { WritingEmbedPreviewWrapper } from "../writing-embed-preview/writing-embed-preview";
import classNames from "classnames";
import { atom, useSetAtom } from "jotai";
import { EmbedSettings, DEFAULT_EMBED_SETTINGS } from "src/types/embed-settings";
import { WRITING_LINE_HEIGHT } from "src/constants";
import type { Box } from "@tldraw/tldraw";

///////
///////


// Per-embed edit state: multiple writing embeds can be in edit mode at once (both unlocked).
export enum WritingEmbedState {
	preview = 'preview',
	loadingEditor = 'loadingEditor',
	editor = 'editor',
	loadingPreview = 'unloadingEditor',
}
export const embedsInEditModeAtom = atom<Set<string>>(new Set<string>());

/** True if any writing embed is in edit mode (for keyboard handler). */
export const anyWritingEmbedInEditModeAtom = atom<boolean>((get) => {
	return get(embedsInEditModeAtom).size > 0;
});

///////

export type WritingEditorControls = {
	save: Function,
	saveAndHalt: Function,
	eraseAll: () => Promise<void>,
}

export function WritingEmbed (props: {
	plugin: InkPlugin,
	/** Empty if leaf could not be resolved from CodeMirror (unified undo disabled for this embed). */
	workspaceLeafId: string,
	embedId?: string,
	writingFileRef: TFile | null,
	partialEmbedFilepath: string,
    pageData?: InkFileData,
	embedSettings?: EmbedSettings,
    save: (pageData: InkFileData) => void,
	remove: Function,
	setEmbedProps?: (aspectRatio: number) => void,
	onRequestMeasure?: () => void,
	sourceMdFile?: TFile,
	isPendingPaste?: boolean,
	resolveAsReference?: () => void,
	resolveAsDuplicate?: () => Promise<void>,
	locateFile?: () => void,
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

	const setEmbedsInEditMode = useSetAtom(embedsInEditModeAtom);

	// Calculate initial height from aspectRatio for JSX styles
	// Use a default width (700px) that matches typical CodeMirror content width
	// The actual width will be determined by the container, and resize callbacks will update height
	const defaultInitialWidth = 700;
	const initialHeight = defaultInitialWidth / embedAspectRatioRef.current;
	
	// On first mount
	React.useEffect( () => {
		if(embedShouldActivateImmediately() && props.embedId) {
			setTimeout( () => {
				switchToEditMode();
			},200);
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
			text: 'Convert to Drawing',
			action: () => {
				if (!props.writingFileRef) return;
				new FileConversionModal(props.plugin, props.writingFileRef, 'inkDrawing', {
					sourceMdFile: props.sourceMdFile,
					onConversionComplete: () => ignoreChangesAndSwitchToPreviewMode(),
				}).open();
			}
		},
		{
			text: 'Open writing',
			action: async () => {
				await openInkFile(props.writingFileRef as TFile);
			}
		},
		{
			text: 'Remove embed',
			action: () => {
				if (!props.writingFileRef || !props.sourceMdFile) {
					props.remove();
					return;
				}
				openRemoveEmbedFlow(
					props.plugin,
					props.writingFileRef,
					props.sourceMdFile,
					'inkWriting',
					() => props.remove(),
				);
			},
		},
		{ separator: true },
		{
			text: 'Erase all',
			warning: true,
			action: () => {
				new ConfirmationModal({
					plugin: props.plugin,
					title: 'Erase all strokes?',
					message: 'This will remove all strokes from the canvas.',
					confirmLabel: 'Erase all',
					confirmAction: () => editorControlsRef.current?.eraseAll?.(),
				}).open();
			},
		},
	]

	////////////

	// When no file, show a unified not-found banner regardless of pending state
	if (!props.writingFileRef) {
		return <>
			<div className='ddc_ink_embed ddc_ink_writing-embed'>
				<div className='ddc_ink_pending-banner ddc_ink_pending-banner--not-found'>
					<span className='ddc_ink_pending-banner__title'>Writing file not found: {props.partialEmbedFilepath}</span>
					<div className='ddc_ink_pending-banner__actions'>
						<button
							className='ddc_ink_pending-banner__btn ddc_ink_pending-banner__btn--primary'
							onClick={() => props.locateFile?.()}
						>
							Locate file
						</button>
					</div>
				</div>
			</div>
		</>;
	}

	return <>		
		<div
			ref = {embedContainerElRef}
			className = {classNames([
				'ddc_ink_embed',
				'ddc_ink_writing-embed',
				props.isPendingPaste && 'ddc_ink_embed--pending',
			])}
			style = {{
				// Must be padding as margin creates codemirror calculation issues
				paddingTop: '1em',
				paddingBottom: '0.5em',
			}}
		>
			{props.isPendingPaste && props.writingFileRef && (
				<div className='ddc_ink_pending-banner'>
					<span className='ddc_ink_pending-banner__title'>Copied embed — reference source or duplicate?</span>
					<div className='ddc_ink_pending-banner__actions'>
						<button
							className='ddc_ink_pending-banner__btn ddc_ink_pending-banner__btn--primary'
							onClick={() => props.resolveAsReference?.()}
						>
							Reference existing file
						</button>
						<button
							className='ddc_ink_pending-banner__btn ddc_ink_pending-banner__btn--primary'
							onClick={() => props.resolveAsDuplicate?.()}
						>
							Make duplicate
						</button>
					</div>
				</div>
			)}

			{/* Include another container so that it's height isn't affected by the padding of the outer container */}
			{props.writingFileRef && (
				<div
					className = 'ddc_ink_resize-container'
					ref = {resizeContainerElRef}
					style = {{
						width: '100%',
						height: initialHeight + 'px',
					}}
				>
				
					<WritingEmbedPreviewWrapper
						embedId = {props.embedId}
						plugin = {props.plugin}
						onResize = {(height: number) => applySizingWhilePreviewing(height)}
						writingFile = {props.writingFileRef}
						onClick = {props.isPendingPaste ? async () => {} : async (event) => {
							switchToEditMode();
						}}
					/>

					<TldrawWritingEditorWrapper
						plugin = {props.plugin} // TODO: Try and remove this
						workspaceLeafId = {props.workspaceLeafId}
						embedId = {props.embedId}
						onResize = {(invitingBounds, tightBounds) => applySizingWhileEditing(invitingBounds, tightBounds)}
						writingFile = {props.writingFileRef}
						save = {props.save}
						embedded
						saveControlsReference = {registerEditorControls}
						closeEditor = {saveAndSwitchToPreviewMode}
						extendedMenu = {commonExtendedOptions}
					/>

				</div>
			)}

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

		applyEmbedHeight(height);
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
			applyEmbedHeight(editorHeight);
		}

		// Store tight aspect ratio for preview (used when switching to preview mode)
		const previewRatio = tightBounds?.w && tightBounds?.h ? tightBounds.w / tightBounds.h : null;
		if (previewRatio && isFinite(previewRatio) && previewRatio > 0) {
			embedAspectRatioRef.current = previewRatio;
		}
	}

	function applyEmbedHeight(height: number) {
		if(!resizeContainerElRef.current) return;
		resizeContainerElRef.current.style.height = height + 'px';
		const heightChanged = previousHeightRef.current === null || Math.abs(height - previousHeightRef.current) > 1;
		if(heightChanged) props.onRequestMeasure?.();
		previousHeightRef.current = height;
		setTimeout( () => {
			// Applies after slight delay so it doesn't affect the first resize
			if(!resizeContainerElRef.current) return;
			resizeContainerElRef.current.classList.add('ddc_ink_smooth-transition');
		}, 100)
	}

	function switchToEditMode() {
		if (!props.embedId) return;
		verbose(['Add writing embed to edit mode', props.embedId]);
		logToVault('Writing embed → edit: ' + (props.writingFileRef?.path ?? props.partialEmbedFilepath));
		setEmbedsInEditMode((prev: Set<string>) => new Set(prev).add(props.embedId!));
	}

	function ignoreChangesAndSwitchToPreviewMode() {
		logToVault('Writing embed → preview (discarded): ' + (props.writingFileRef?.path ?? props.partialEmbedFilepath));
		if (props.embedId) {
			setEmbedsInEditMode((prev: Set<string>) => {
				const next = new Set(prev);
				next.delete(props.embedId!);
				return next;
			});
		}
	}

	async function saveAndSwitchToPreviewMode() {
		verbose(['Remove writing embed from edit mode', props.embedId]);
		logToVault('Writing embed → preview (saved): ' + (props.writingFileRef?.path ?? props.partialEmbedFilepath));
		if(editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}

		// Apply preview height immediately based on tight aspectRatio before switching modes
		if (resizeContainerElRef.current && embedAspectRatioRef.current) {
			const containerWidth = resizeContainerElRef.current.getBoundingClientRect().width;
			if (containerWidth) {
				const previewHeight = containerWidth / embedAspectRatioRef.current;
				applyEmbedHeight(previewHeight);
			}
		}

		if (props.embedId) {
			setEmbedsInEditMode((prev: Set<string>) => {
				const next = new Set(prev);
				next.delete(props.embedId!);
				return next;
			});
		}

		// Persist the aspectRatio to markdown
		if (props.setEmbedProps) {
			props.setEmbedProps(embedAspectRatioRef.current);
		}
	}
	
};

export default WritingEmbed;
