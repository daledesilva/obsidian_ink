import "./drawing-embed.scss";
import * as React from "react";
import { useRef } from "react";
import InkPlugin from "src/main";
import { InkFileData } from "src/components/formats/current/types/file-data";
import { embedShouldActivateImmediately } from "src/logic/utils/storage";
import { getFullPageWidth } from "src/logic/utils/getFullPageWidth";
import { verbose } from "src/logic/utils/log-to-console";
import { getGlobals } from "src/stores/global-store";
import { openInkFile } from "src/logic/utils/open-file";
import { FileConversionModal } from "src/components/dom-components/modals/file-conversion-modal/file-conversion-modal";
import { openRemoveEmbedFlow } from "src/logic/utils/remove-embed-flow";
import { TFile } from "obsidian";
import classNames from "classnames";
import { atom, useSetAtom } from "jotai";
import { DRAWING_INITIAL_WIDTH, DRAWING_INITIAL_ASPECT_RATIO } from "src/constants";
import { pushDrawingEmbedResize } from "src/logic/undo-redo/unified-undo-stack";
import { DrawingEmbedPreviewWrapper } from "../drawing-embed-preview/drawing-embed-preview";
import { EmbedSettings } from "src/types/embed-settings";
import { TldrawDrawingEditorWrapper } from "../tldraw-drawing-editor/tldraw-drawing-editor";

///////
///////

// Per-embed edit state: multiple drawing embeds can be in edit mode at once (both unlocked).
// embedStateAtom_v2 retained for keyboard-handler "any embed in edit mode" check.
export enum DrawingEmbedState {
	preview = 'preview',
	loadingEditor = 'loadingEditor',
	editor = 'editor',
	loadingPreview = 'unloadingEditor',
}
export const embedsInEditModeAtom_v2 = atom<Set<string>>(new Set<string>());
export const embedStateAtom_v2 = atom(DrawingEmbedState.preview);

/** True if any drawing embed is in edit mode (for keyboard handler). */
export const anyDrawingEmbedInEditModeAtom_v2 = atom<boolean>((get) => {
	return get(embedsInEditModeAtom_v2).size > 0;
});

///////

export type DrawingEditorControls = {
	save: Function,
	saveAndHalt: Function,
}

interface DrawingEmbed_Props {
	embedId?: string,
	embeddedFile: TFile | null,
	embedSettings: EmbedSettings,
	saveSrcFile: (pageData: InkFileData) => {},
    remove: Function,
    setEmbedProps?: (width: number, aspectRatio: number) => void,
    onRequestMeasure?: () => void,
	partialEmbedFilepath: string,
	sourceMdFile?: TFile,
	isPendingPaste?: boolean,
	resolveAsReference?: () => void,
	resolveAsDuplicate?: () => Promise<void>,
	locateFile?: () => void,
}

export function DrawingEmbed (props: DrawingEmbed_Props) {

	console.log('props.embedSettings', props.embedSettings);

	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	const editorControlsRef = useRef<DrawingEditorControls>();
	const embedWidthRef = useRef<number>(props.embedSettings.embedDisplay.width || DRAWING_INITIAL_WIDTH);
	const embedAspectRatioRef = useRef<number>(props.embedSettings.embedDisplay.aspectRatio || DRAWING_INITIAL_ASPECT_RATIO);
	const resizeStartWidthRef = useRef<number>(0);
	const resizeStartAspectRatioRef = useRef<number>(0);

	const setEmbedsInEditMode = useSetAtom(embedsInEditModeAtom_v2);

	// On first mount
	React.useEffect( () => {
		if(embedShouldActivateImmediately() && props.embedId) {
			setTimeout( () => {
				switchToEditMode();
			},200);
		}
		
		window.addEventListener('resize', handleResize);
		handleResize();

        return () => {
			window.removeEventListener('resize', handleResize);
		}
	}, [])

	const commonExtendedOptions = [
		{
			text: 'Open drawing',
			action: async () => {
				await openInkFile(props.embeddedFile as TFile);
			}
		},
		{ separator: true },
		{
			text: 'Convert to Writing',
			action: () => {
				if (!props.embeddedFile) return;
				new FileConversionModal(getGlobals().plugin, props.embeddedFile, 'inkWriting', {
					sourceMdFile: props.sourceMdFile,
					onConversionComplete: () => ignoreChangesAndSwitchToPreviewMode(),
				}).open();
			}
		},
		{
			text: 'Remove embed',
			action: () => {
				if (!props.embeddedFile || !props.sourceMdFile) {
					props.remove();
					return;
				}
				openRemoveEmbedFlow(
					getGlobals().plugin,
					props.embeddedFile,
					props.sourceMdFile,
					'inkDrawing',
					() => props.remove(),
				);
			},
		},
	].filter(Boolean)

	console.log('props.embeddedFile', props.embeddedFile);

	////////////

	// When no file, show a unified not-found banner regardless of pending state
	if (!props.embeddedFile) {
		return <>
			<div className='ddc_ink_embed ddc_ink_drawing-embed'>
				<div className='ddc_ink_pending-banner ddc_ink_pending-banner--not-found'>
					<span className='ddc_ink_pending-banner__title'>Drawing file not found: {props.partialEmbedFilepath}</span>
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
				'ddc_ink_drawing-embed',
				props.isPendingPaste && 'ddc_ink_embed--pending',
			])}
			style = {{
				// Must be padding as margin creates codemirror calculation issues
				paddingTop: '1em',
				paddingBottom: '0.5em',
			}}
		>
			{props.isPendingPaste && props.embeddedFile && (
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
			{props.embeddedFile && (
				<div
					className = 'ddc_ink_resize-container'
					ref = {resizeContainerElRef}
					style = {{
						width: embedWidthRef.current + 'px',
						height: embedWidthRef.current / embedAspectRatioRef.current + 'px',
						position: 'relative', // For absolute positioning inside
						left: '50%',
						translate: '-50%',
					}}
				>
				
	                <DrawingEmbedPreviewWrapper
						embedId = {props.embedId}
						embeddedFile = {props.embeddedFile}
						embedSettings = {props.embedSettings}
						onReady = {() => {}}
						onClick = {props.isPendingPaste ? async () => {} : async () => {
							switchToEditMode();
						}}
					/>
				
	                <TldrawDrawingEditorWrapper
						embedId = {props.embedId}
						plugin = {getGlobals().plugin}
						onReady = {() => {}}
						drawingFile = {props.embeddedFile}
						save = {props.saveSrcFile}
						extendedMenu = {commonExtendedOptions}
						embedded
						saveControlsReference = {registerEditorControls}
						closeEditor = {saveAndSwitchToPreviewMode}
						resizeEmbed = {resizeEmbed}
						onResizeStart = {onResizeStart}
						onResizeEnd = {onResizeEnd}
						applyEmbedDimensions = {applyEmbedDimensions}
					/>

				</div>
			)}
		</div>
	</>;

	//// Helper functions
	/////////////////////

	function registerEditorControls(handlers: DrawingEditorControls) {
		editorControlsRef.current = handlers;
	}

	/**
	 * Used for resizes during edit mode.
	 * @param pxWidthDiff 
	 * @param pxHeightDiff 
	 * @returns 
	 */
	function resizeEmbed(pxWidthDiff: number, pxHeightDiff: number) {
		if(!resizeContainerElRef.current) return;
		const maxWidth = getFullPageWidth(embedContainerElRef.current)
		if(!maxWidth) return;

		let destWidth = embedWidthRef.current + pxWidthDiff;
		if(destWidth < 350) destWidth = 350;
		if(destWidth > maxWidth) destWidth = maxWidth;
		
		const curHeight = resizeContainerElRef.current.getBoundingClientRect().height;
		let destHeight = curHeight + pxHeightDiff;
		if(destHeight < 150) destHeight = 150;

		embedWidthRef.current = destWidth;
		embedAspectRatioRef.current = destWidth / destHeight;
		resizeContainerElRef.current.style.width = embedWidthRef.current + 'px';
		resizeContainerElRef.current.style.height = destHeight + 'px';
		props.onRequestMeasure?.();
		// props.setEmbedProps(embedHeightRef.current); // NOTE: Can't do this here because it causes the embed to reload
	}

	function onResizeStart() {
		resizeStartWidthRef.current = embedWidthRef.current;
		resizeStartAspectRatioRef.current = embedAspectRatioRef.current;
	}

	function onResizeEnd() {
		const fromWidth = resizeStartWidthRef.current;
		const fromAspectRatio = resizeStartAspectRatioRef.current;
		const toWidth = embedWidthRef.current;
		const toAspectRatio = embedAspectRatioRef.current;
		const dimensionsChanged = fromWidth !== toWidth || fromAspectRatio !== toAspectRatio;
		if (dimensionsChanged && props.embedId) {
			pushDrawingEmbedResize({
				type: 'embed-resize',
				embedId: props.embedId,
				fromWidth,
				fromAspectRatio,
				toWidth,
				toAspectRatio,
			});
		}
	}

	function applyEmbedDimensions(width: number, aspectRatio: number) {
		embedWidthRef.current = width;
		embedAspectRatioRef.current = aspectRatio;
		if (resizeContainerElRef.current) {
			resizeContainerElRef.current.style.width = width + 'px';
			resizeContainerElRef.current.style.height = width / aspectRatio + 'px';
			props.onRequestMeasure?.();
		}
	}

	/**
	 * Used when initialising edit mode
	 * @returns 
	 */
	function applyEmbedHeight() {
		if(!resizeContainerElRef.current) return;
		resizeContainerElRef.current.style.width = embedWidthRef.current + 'px';
		const curWidth = resizeContainerElRef.current.getBoundingClientRect().width;
		resizeContainerElRef.current.style.height = curWidth/embedAspectRatioRef.current + 'px';
		props.onRequestMeasure?.();
	}

	// function resetEmbedHeight() {
	// 	if(!embedContainerElRef.current) return;
	// 	const newHeight = embedContainerElRef.current?.offsetHeight;
	// 	if(newHeight) {
	// 		embedContainerElRef.current.style.height = newHeight + 'px';
	// 	} else {
	// 		embedContainerElRef.current.style.height = 'unset'; // TODO: CSS transition doesn't work between number and unset
	// 	}
	// }

	function switchToEditMode() {
		if (!props.embedId) return;
		verbose(['Add embed to edit mode', props.embedId]);
		applyEmbedHeight();
		setEmbedsInEditMode((prev: Set<string>) => new Set(prev).add(props.embedId!));
	}

	function ignoreChangesAndSwitchToPreviewMode() {
		if (props.embedId) {
			setEmbedsInEditMode((prev: Set<string>) => {
				const next = new Set(prev);
				next.delete(props.embedId!);
				return next;
			});
		}
	}

    async function saveAndSwitchToPreviewMode() {
		verbose(['Remove embed from edit mode', props.embedId]);

		if(editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}

		if (props.embedId) {
			setEmbedsInEditMode((prev: Set<string>) => {
				const next = new Set(prev);
				next.delete(props.embedId!);
				return next;
			});
		}
        if (props.setEmbedProps) {
            props.setEmbedProps(embedWidthRef.current, embedAspectRatioRef.current);
        }
	}

	function handleResize() {
		const maxWidth = getFullPageWidth(embedContainerElRef.current);
		if (resizeContainerElRef.current) {
			resizeContainerElRef.current.style.maxWidth = '100%';
			const curWidth = resizeContainerElRef.current.getBoundingClientRect().width;
			resizeContainerElRef.current.style.height = curWidth/embedAspectRatioRef.current + 'px';
			props.onRequestMeasure?.();
		}
	};
};


export default DrawingEmbed;

////////
////////

async function refreshPageData(plugin: InkPlugin, file: TFile): Promise<InkFileData> {
	const v = plugin.app.vault;
	const pageDataStr = await v.read(file);
	const pageData = JSON.parse(pageDataStr) as InkFileData;
	return pageData;
}
