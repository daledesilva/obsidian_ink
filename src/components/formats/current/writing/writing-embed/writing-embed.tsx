import "./writing-embed.scss";
import * as React from "react";
import { useRef } from "react";
import { WritingEditorWrapper } from "../writing-editor/writing-editor";
import { extractInkJsonFromSvg } from "src/logic/utils/extractInkJsonFromSvg";
import InkPlugin from "src/main";
import { InkFileData } from "src/components/formats/current/types/file-data";
import { isInkCanvasFile } from "src/components/formats/current/utils/ink-file-storage-engine";
import { FileConversionModal } from "src/components/dom-components/modals/file-conversion-modal/file-conversion-modal";
import { ConfirmationModal } from "src/components/dom-components/modals/confirmation-modal/confirmation-modal";
import { openRemoveEmbedFlow } from "src/logic/utils/remove-embed-flow";
import { openInkFile, openInkFileInView } from "src/logic/utils/open-file";
import { embedShouldActivateImmediately } from "src/logic/utils/storage";
import { getBooxConnectionEnabled } from "src/logic/device-settings/device-settings";
import { useBooxConnectionEnabled } from "src/logic/device-settings/use-boox-connection-enabled";
import { verbose } from "src/logic/utils/universal-dev-logging";
import { logToVault } from "src/logic/utils/log-to-vault";
import { TFile, WorkspaceLeaf, Notice } from "obsidian";
import { WritingEmbedPreviewWrapper } from "../writing-embed-preview/writing-embed-preview";
import classNames from "classnames";
import { atom, useSetAtom } from "jotai";
import { EmbedSettings, DEFAULT_EMBED_SETTINGS } from "src/types/embed-settings";
import type { PageBounds } from "../writing-editor/page-bounds";
import { replaceActiveInkEmbed, clearActiveInkEmbed } from "src/stores/active-ink-embed-store";
import { getGlobals } from "src/stores/global-store";
import { type MenuOption } from "src/components/jsx-components/overflow-menu/overflow-menu";
import { copyEmbedMarkdownToClipboard } from "src/logic/utils/copy-embed-to-clipboard";
import { EmbedPreviewContextMenu } from "src/components/jsx-components/embed-preview-context-menu/embed-preview-context-menu";

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
	save: () => void | Promise<void>,
	saveAndHalt: () => Promise<void>,
	eraseAll: () => Promise<void>,
	/** Dedicated view: resets camera after viewport resize (stored on controls by WritingView). */
	resize?: () => void,
	/** When the host leaf is inactive, closes the Boox overlay and suppresses adjustment sends. */
	setBooxOverlayActive?: (isActive: boolean) => void,
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
	remove: () => void,
	setEmbedProps?: (aspectRatio: number) => void,
	onRequestMeasure?: () => void,
	sourceMdFile?: TFile,
	isPendingPaste?: boolean,
	resolveAsReference?: () => void,
	resolveAsDuplicate?: () => void | Promise<void>,
	locateFile?: () => void,
	replaceEmbedAfterConversion?: (
		finalFile: TFile,
		toType: 'inkWriting' | 'inkDrawing',
	) => void | Promise<void>,
	getEmbedMarkdown?: () => string | null,
	deleteEmbed?: () => void,
}) {
	const isBooxConnectionEnabled = useBooxConnectionEnabled();
	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	const editorControlsRef = useRef<WritingEditorControls>();
	const embedAspectRatioRef = useRef<number>(props.embedSettings?.embedDisplay?.aspectRatio || DEFAULT_EMBED_SETTINGS.embedDisplay.aspectRatio);
	const previousHeightRef = useRef<number | null>(null);
	const defaultInitialWidth = 700;
	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)
	// const [embedId] = useState<string>(nanoid());
	// const activeEmbedId = useSelector((state: GlobalSessionState) => state.activeEmbedId);
	// const dispatch = useDispatch();

	const setEmbedsInEditMode = useSetAtom(embedsInEditModeAtom);
	type WritingFormat = 'tldraw' | 'ink-canvas' | 'unknown';
	const [writingFormat, setWritingFormat] = React.useState<WritingFormat>('unknown');

	React.useLayoutEffect(() => {
		const resizeContainer = resizeContainerElRef.current;
		if (!resizeContainer) return;
		const aspectRatio = props.embedSettings?.embedDisplay?.aspectRatio
			|| DEFAULT_EMBED_SETTINGS.embedDisplay.aspectRatio;
		embedAspectRatioRef.current = aspectRatio;
		previousHeightRef.current = null;
		resizeContainer.classList.remove('ddc_ink_smooth-transition');
		const containerWidth = resizeContainer.getBoundingClientRect().width || defaultInitialWidth;
		resizeContainer.style.height = containerWidth / aspectRatio + 'px';
	}, [props.writingFileRef?.path, props.embedSettings?.embedDisplay?.aspectRatio]);

	React.useEffect(() => {
		if (!props.writingFileRef) return;
		setWritingFormat('unknown');
		props.plugin.app.vault.read(props.writingFileRef).then(svg => {
			const data = extractInkJsonFromSvg(svg);
			if (!data) {
				setWritingFormat('unknown');
				return;
			}
			const engine = isInkCanvasFile(data) ? 'ink-canvas' : 'tldraw';
			setWritingFormat(engine);
		}).catch(() => setWritingFormat('unknown'));
	}, [props.writingFileRef]);

	// On first mount
	React.useEffect( () => {
		if(embedShouldActivateImmediately() && props.embedId) {
			window.setTimeout( () => {
				void switchToEditMode();
			},200);
		}
	}, [])

	// Mirror drawing-embed: close or restore the Boox overlay when switching workspace leaves.
	React.useEffect(() => {
		if (!props.workspaceLeafId) return;
		const plugin = getGlobals().plugin;
		const handler = (leaf: WorkspaceLeaf | null) => {
			const isThisLeafActive = leaf?.id === props.workspaceLeafId;
			editorControlsRef.current?.setBooxOverlayActive?.(isThisLeafActive);
		};
		plugin.app.workspace.on('active-leaf-change', handler);
		return () => {
			plugin.app.workspace.off('active-leaf-change', handler);
		};
	}, [props.workspaceLeafId])

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

	function handleCopyEmbed(_source: 'context-menu' | 'overflow-menu') {
		const embedStr = props.getEmbedMarkdown?.() ?? null;
		if (!embedStr) {
			new Notice('Could not read embed markdown to copy');
			return;
		}
		void copyEmbedMarkdownToClipboard(embedStr);
	}

	function handleDeleteEmbed() {
		const removeFn = props.deleteEmbed ?? props.remove;
		if (!props.writingFileRef || !props.sourceMdFile) {
			removeFn();
			return;
		}
		openRemoveEmbedFlow(
			props.plugin,
			props.writingFileRef,
			props.sourceMdFile,
			'inkWriting',
			() => removeFn(),
		);
	}

	const embedClipboardMenuOptions: MenuOption[] = [
		{
			text: 'Copy embed',
			action: () => { handleCopyEmbed('context-menu'); },
		},
		{
			text: 'Delete embed',
			warning: true,
			action: () => { handleDeleteEmbed(); },
		},
	];

	const commonExtendedOptions = [
		{
			text: 'Open writing',
			action: () => {
				void openInDedicatedView();
			}
		},
		{ separator: true },
		{
			text: 'Copy embed',
			action: () => { handleCopyEmbed('overflow-menu'); },
		},
		{
			text: 'Delete embed',
			warning: true,
			action: () => { handleDeleteEmbed(); },
		},
		{ separator: true },
		{
			text: 'Convert to Drawing',
			action: () => {
				if (!props.writingFileRef) return;
				new FileConversionModal(props.plugin, props.writingFileRef, 'inkDrawing', {
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
					plugin: props.plugin,
					title: 'Erase all strokes?',
					message: 'This will remove all strokes from the canvas.',
					confirmLabel: 'Erase all',
					confirmAction: () => void editorControlsRef.current?.eraseAll?.(),
				}).open();
			},
		},
	] as MenuOption[]

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
							onClick={() => void props.resolveAsDuplicate?.()}
						>
							Make duplicate
						</button>
					</div>
				</div>
			)}

			{/* Include another container so that it's height isn't affected by the padding of the outer container */}
			{props.writingFileRef && (
				<div
					className = {classNames([
						'ddc_ink_resize-container',
						isBooxConnectionEnabled && 'ddc_ink_resize-container--boox',
					])}
					ref = {resizeContainerElRef}
				>
				
					<EmbedPreviewContextMenu menuOptions={embedClipboardMenuOptions}>
						<WritingEmbedPreviewWrapper
							embedId = {props.embedId}
							plugin = {props.plugin}
							onResize = {(height: number) => applySizingWhilePreviewing(height)}
							writingFile = {props.writingFileRef}
							onClick = {props.isPendingPaste ? () => {} : () => void switchToEditMode()}
						/>
					</EmbedPreviewContextMenu>

					{(writingFormat === 'ink-canvas' || writingFormat === 'tldraw') && props.writingFileRef && (
						<WritingEditorWrapper
							plugin={props.plugin}
							workspaceLeafId={props.workspaceLeafId}
							embedId={props.embedId}
							onResize={(invitingBounds, tightBounds) => applySizingWhileEditing(invitingBounds, tightBounds)}
							writingFile={props.writingFileRef}
							save={props.save}
							embedded
							saveControlsReference={registerEditorControls}
							closeEditor={() => void saveAndSwitchToPreviewMode()}
							extendedMenu={commonExtendedOptions}
							onOpenInDedicatedView={() => void openInDedicatedView()}
						/>
					)}

				</div>
			)}

		</div>
	</>;
	
	// Helper functions
	///////////////////

	function registerEditorControls(handlers: WritingEditorControls) {
		editorControlsRef.current = handlers;
	}

	async function openInDedicatedView() {
		if (!props.writingFileRef) return;
		if (editorControlsRef.current) {
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
		editorControlsRef.current = undefined;
		await openInkFileInView(props.writingFileRef, 'inkWriting');
	}

	function applySizingWhilePreviewing(height: number) {
		if (!height) return;
		if(!resizeContainerElRef.current) return;

		applyEmbedHeight(height);
		// DO NOT recalculate embedAspectRatioRef here - editor is authoritative source
	}

	function applySizingWhileEditing(invitingBounds: PageBounds, tightBounds: PageBounds) {
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
		if (!resizeContainerElRef.current) return;
		resizeContainerElRef.current.style.height = height + 'px';
		const heightChanged = previousHeightRef.current === null
			|| Math.abs(height - previousHeightRef.current) > 1;
		if (heightChanged) props.onRequestMeasure?.();
		previousHeightRef.current = height;
		window.setTimeout(() => {
			// Applies after slight delay so it doesn't affect the first resize
			if (!resizeContainerElRef.current) return;
			resizeContainerElRef.current.classList.add('ddc_ink_smooth-transition');
		}, 100);
	}

	async function switchToEditMode() {
		if (!props.embedId) return;
		verbose(['Add writing embed to edit mode', props.embedId]);
		logToVault('Writing embed → edit: ' + (props.writingFileRef?.path ?? props.partialEmbedFilepath));

		// When Boox is enabled, only one ink embed (writing or drawing) can be active at a time.
		if (getBooxConnectionEnabled()) {
			await replaceActiveInkEmbed(props.embedId, saveAndSwitchToPreviewMode);
		}

		setEmbedsInEditMode((prev: Set<string>) => new Set(prev).add(props.embedId!));
	}

	function ignoreChangesAndSwitchToPreviewMode() {
		logToVault('Writing embed → preview (discarded): ' + (props.writingFileRef?.path ?? props.partialEmbedFilepath));
		if (props.embedId) {
			clearActiveInkEmbed(props.embedId);
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
			clearActiveInkEmbed(props.embedId);
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
