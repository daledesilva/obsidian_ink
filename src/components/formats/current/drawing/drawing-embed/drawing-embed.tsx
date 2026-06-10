import "./drawing-embed.scss";
import * as React from "react";
import { useRef } from "react";
import InkPlugin from "src/main";
import { InkFileData } from "src/components/formats/current/types/file-data";
import { isInkCanvasFile } from "src/components/formats/current/utils/ink-file-storage-engine";
import { embedShouldActivateImmediately } from "src/logic/utils/storage";
import { getBooxConnectionEnabled } from "src/logic/device-settings/device-settings";
import { useBooxConnectionEnabled } from "src/logic/device-settings/use-boox-connection-enabled";
import { getFullPageWidth } from "src/logic/utils/getFullPageWidth";
import { inkDebugLog, verbose } from "src/logic/utils/universal-dev-logging";
import { logToVault } from "src/logic/utils/log-to-vault";
import { getGlobals } from "src/stores/global-store";
import { openInkFile, openInkFileInView } from "src/logic/utils/open-file";
import { FileConversionModal } from "src/components/dom-components/modals/file-conversion-modal/file-conversion-modal";
import { ConfirmationModal } from "src/components/dom-components/modals/confirmation-modal/confirmation-modal";
import { openRemoveEmbedFlow } from "src/logic/utils/remove-embed-flow";
import { TFile, WorkspaceLeaf } from "obsidian";
import classNames from "classnames";
import { atom, useSetAtom } from "jotai";
import { DRAWING_INITIAL_WIDTH, DRAWING_INITIAL_ASPECT_RATIO } from "src/constants";
import { pushDrawingEmbedResize } from "src/logic/undo-redo/unified-undo-stack";
import { DrawingEmbedPreviewWrapper } from "../drawing-embed-preview/drawing-embed-preview";
import { EmbedSettings } from "src/types/embed-settings";
import { DrawingEditorWrapper } from "../drawing-editor/drawing-editor";
import { type MenuOption } from "src/components/jsx-components/overflow-menu/overflow-menu";
import { replaceActiveInkEmbed, clearActiveInkEmbed } from "src/stores/active-ink-embed-store";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";

///////
///////

type DrawingFormat = 'legacyInk' | 'ink-canvas' | 'unknown';

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
	save: () => void | Promise<void>,
	saveAndHalt: () => Promise<void>,
	eraseAll: () => Promise<void>,
	/** Notify the editor that the host view is becoming active or inactive.
	 *  When inactive, the Boox overlay is closed and adjustment sends are suppressed.
	 *  When active, the overlay is re-opened at the current bounds. Only meaningful
	 *  for dedicated drawing views; embeds can ignore this. */
	setBooxOverlayActive?: (isActive: boolean) => void,
}

interface DrawingEmbed_Props {
	/** Empty if leaf could not be resolved from CodeMirror (unified undo disabled for this embed). */
	workspaceLeafId: string,
	embedId?: string,
	embeddedFile: TFile | null,
	embedSettings: EmbedSettings,
	saveSrcFile: (pageData: InkFileData) => void,
    remove: () => void,
    setEmbedProps?: (width: number, aspectRatio: number) => void,
	setEmbedViewBox?: (viewBox: { x: number; y: number; width: number; height: number }) => void,
	setEmbedPropsAndViewBox?: (params: {
		width: number;
		aspectRatio: number;
		viewBox: { x: number; y: number; width: number; height: number };
	}) => void,
    onRequestMeasure?: () => void,
	partialEmbedFilepath: string,
	sourceMdFile?: TFile,
	isPendingPaste?: boolean,
	resolveAsReference?: () => void,
	resolveAsDuplicate?: () => void | Promise<void>,
	locateFile?: () => void,
	replaceEmbedAfterConversion?: (
		finalFile: TFile,
		toType: 'inkWriting' | 'inkDrawing',
	) => void | Promise<void>,
}

export function DrawingEmbed (props: DrawingEmbed_Props) {

	const isBooxConnectionEnabled = useBooxConnectionEnabled();
	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	const editorControlsRef = useRef<DrawingEditorControls>();
	const embedWidthRef = useRef<number>(props.embedSettings.embedDisplay.width || DRAWING_INITIAL_WIDTH);
	const embedAspectRatioRef = useRef<number>(props.embedSettings.embedDisplay.aspectRatio || DRAWING_INITIAL_ASPECT_RATIO);
	const didExplicitSaveEmbedSettingsRef = useRef(false);
	const resizeStartWidthRef = useRef<number>(0);
	const resizeStartAspectRatioRef = useRef<number>(0);
	const [drawingFormat, setDrawingFormat] = React.useState<DrawingFormat>('unknown');

	const setEmbedsInEditMode = useSetAtom(embedsInEditModeAtom_v2);

	// Detect file format on mount
	React.useEffect(() => {
		if (!props.embeddedFile) return;
		void detectFormat(props.embeddedFile);
	}, [props.embeddedFile?.path]);

	async function detectFormat(file: TFile) {
		try {
			const svgString = await file.vault.read(file);
			if (!svgString) { setDrawingFormat('legacyInk'); return; }
			const inkFileData = extractInkJsonFromSvg(svgString);
			if (!inkFileData) { setDrawingFormat('legacyInk'); return; }
			// Editor is always ink-canvas; legacy ink files migrate on load.
			setDrawingFormat(isInkCanvasFile(inkFileData) ? 'ink-canvas' : 'legacyInk');
		} catch {
			setDrawingFormat('legacyInk');
		}
	}

	// On first mount
	React.useEffect( () => {
		if(embedShouldActivateImmediately() && props.embedId) {
			window.setTimeout( () => {
				void switchToEditMode();
			},200);
		}
		
		window.addEventListener('resize', handleResize);
		handleResize();

        return () => {
			window.removeEventListener('resize', handleResize);
		}
	}, [])

	// Mirror the active-leaf-change behaviour from drawing-view.tsx: restore or close
	// the Boox overlay when the user switches to/from the note containing this embed.
	// Only has any effect while the embed is in editor mode (editorControlsRef is set).
	React.useEffect(() => {
		if (!props.workspaceLeafId) return;
		const plugin = getGlobals().plugin;
		const booxConnectionTyped = plugin.booxConnection as { getSessionCount?: () => number } | undefined;
		const handler = (leaf: WorkspaceLeaf | null) => {
			const isThisLeafActive = leaf?.id === props.workspaceLeafId;
			const sessionCount = booxConnectionTyped?.getSessionCount?.() ?? '?';
			inkDebugLog({
				hypothesisId: 'MULTI-CLOSE',
				location: 'drawing-embed.tsx:active-leaf-change-handler',
				message: 'active-leaf-change fired on embed',
				runId: 'view-connect-debug',
				data: {
					isThisLeafActive,
					thisLeafId: props.workspaceLeafId,
					incomingLeafId: leaf?.id ?? null,
					editorControlsPresent: !!editorControlsRef.current,
					sessionCount,
				},
			});
			editorControlsRef.current?.setBooxOverlayActive?.(isThisLeafActive);
		};
		plugin.app.workspace.on('active-leaf-change', handler);
		return () => {
			plugin.app.workspace.off('active-leaf-change', handler);
		};
	}, [props.workspaceLeafId])

	const commonExtendedOptions = [
		{
			text: 'Open drawing',
			action: async () => {
				await openInDedicatedView();
			}
		},
		{ separator: true },
		{
			text: 'Convert to Writing',
			action: () => {
				if (!props.embeddedFile) return;
				new FileConversionModal(getGlobals().plugin, props.embeddedFile, 'inkWriting', {
					sourceMdFile: props.sourceMdFile,
					onConversionComplete: (finalFile, toType) => {
						if (finalFile) void props.replaceEmbedAfterConversion?.(finalFile, toType);
						ignoreChangesAndSwitchToPreviewMode();
					},
				}).open();
			}
		},
		{ separator: true },
		{
			text: 'Erase all',
			warning: true,
			action: () => {
				new ConfirmationModal({
					plugin: getGlobals().plugin,
					title: 'Erase all strokes?',
					message: 'This will remove all strokes from the canvas.',
					confirmLabel: 'Erase all',
					confirmAction: () => void editorControlsRef.current?.eraseAll?.(),
				}).open();
			},
		},
		{
			text: 'Remove embed',
			warning: true,
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
	].filter(Boolean) as MenuOption[]

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
							onClick={() => void props.resolveAsDuplicate?.()}
						>
							Make duplicate
						</button>
					</div>
				</div>
			)}

			{/* Include another container so that it's height isn't affected by the padding of the outer container */}
			{props.embeddedFile && (
				<div
					className = {classNames([
						'ddc_ink_resize-container',
						isBooxConnectionEnabled && 'ddc_ink_resize-container--boox',
					])}
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
					onClick = {props.isPendingPaste ? () => {} : () => void switchToEditMode()}
				/>

				{(drawingFormat === 'ink-canvas' || drawingFormat === 'legacyInk') && (
					<DrawingEditorWrapper
						embedId = {props.embedId}
						workspaceLeafId = {props.workspaceLeafId}
						onReady = {() => {}}
						drawingFile = {props.embeddedFile}
						save = {props.saveSrcFile}
						extendedMenu = {commonExtendedOptions}
						embedSettings = {props.embedSettings}
						onSaveCameraPosition = {(viewBox) => {
							didExplicitSaveEmbedSettingsRef.current = true;
							// Single rewrite: updating width/aspectRatio first can invalidate the widget
							// range, causing a subsequent viewBox rewrite to silently no-op.
							props.setEmbedPropsAndViewBox?.({
								width: embedWidthRef.current,
								aspectRatio: embedAspectRatioRef.current,
								viewBox,
							});
						}}
						embedded
						saveControlsReference = {registerEditorControls}
						closeEditor = {() => void saveAndSwitchToPreviewMode()}
						resizeEmbed = {resizeEmbed}
						onResizeStart = {onResizeStart}
						onResizeEnd = {onResizeEnd}
						onEmbedResizeEnd = {() => {}}
						applyEmbedDimensions = {applyEmbedDimensions}
						onOpenInDedicatedView = {() => void openInDedicatedView()}
					/>
				)}

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
		destWidth = Math.max(destWidth, 150);
		destWidth = Math.min(destWidth, maxWidth);
		
		const curHeight = resizeContainerElRef.current.getBoundingClientRect().height;
		let destHeight = curHeight + pxHeightDiff;
		destHeight = Math.max(destHeight, 150);
		
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
		if (dimensionsChanged && props.embedId && props.workspaceLeafId) {
			pushDrawingEmbedResize(props.workspaceLeafId, {
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

	async function switchToEditMode() {
		if (!props.embedId) return;
		didExplicitSaveEmbedSettingsRef.current = false;
		verbose(['Add embed to edit mode', props.embedId]);
		logToVault('Drawing embed → edit: ' + (props.embeddedFile?.path ?? props.partialEmbedFilepath));

		// When Boox is enabled, only one ink embed (writing or drawing) can be active at a time.
		const { plugin } = getGlobals();
		if (getBooxConnectionEnabled()) {
			await replaceActiveInkEmbed(props.embedId, saveAndSwitchToPreviewMode);
		}

		applyEmbedHeight();
		setEmbedsInEditMode((prev: Set<string>) => new Set(prev).add(props.embedId!));
	}

	function ignoreChangesAndSwitchToPreviewMode() {
		logToVault('Drawing embed → preview (discarded): ' + (props.embeddedFile?.path ?? props.partialEmbedFilepath));
		if (props.embedId) {
			clearActiveInkEmbed(props.embedId);
			setEmbedsInEditMode((prev: Set<string>) => {
				const next = new Set(prev);
				next.delete(props.embedId!);
				return next;
			});
		}
	}

    async function openInDedicatedView() {
		if (!props.embeddedFile) return;
		if (editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}
		// Dedicated tab edits the same file while this embed could still be "unlocked" in
		// memory. Leaving edit mode unmounts the embed editor so a later lock cannot
		// completeSave stale canvas state over the dedicated view (see vault.modify sequence).
		if (props.embedId) {
			clearActiveInkEmbed(props.embedId);
			setEmbedsInEditMode((prev: Set<string>) => {
				const next = new Set(prev);
				next.delete(props.embedId!);
				return next;
			});
		}
		editorControlsRef.current = undefined;
		await openInkFileInView(props.embeddedFile, 'inkDrawing');
	}

    async function saveAndSwitchToPreviewMode() {
		verbose(['Remove embed from edit mode', props.embedId]);
		logToVault('Drawing embed → preview (saved): ' + (props.embeddedFile?.path ?? props.partialEmbedFilepath));

		if(editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}

		if (props.embedId) {
			clearActiveInkEmbed(props.embedId);
			setEmbedsInEditMode((prev: Set<string>) => {
				const next = new Set(prev);
				next.delete(props.embedId!);
				return next;
			});
		}
		// If the user did NOT explicitly save embed settings, revert any local resize to the
		// last-saved embed settings so a lock/unlock doesn't appear to have persisted changes.
		if (!didExplicitSaveEmbedSettingsRef.current) {
			embedWidthRef.current = props.embedSettings.embedDisplay.width || DRAWING_INITIAL_WIDTH;
			embedAspectRatioRef.current = props.embedSettings.embedDisplay.aspectRatio || DRAWING_INITIAL_ASPECT_RATIO;
			applyEmbedDimensions(embedWidthRef.current, embedAspectRatioRef.current);
		}
	}

	function handleResize() {
		const maxWidth = getFullPageWidth(embedContainerElRef.current);
		if (resizeContainerElRef.current) {
			resizeContainerElRef.current.style.maxWidth = maxWidth + 'px';
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
