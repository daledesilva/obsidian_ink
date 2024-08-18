import "./drawing-embed.scss";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawDrawingEditor } from "./tldraw-drawing-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { TFile } from "obsidian";
import { rememberDrawingFile } from "src/utils/rememberDrawingFile";
import { GlobalSessionState } from "src/logic/stores";
import { useDispatch, useSelector } from "react-redux";
import { DrawingEmbedPreview } from "./drawing-embed-preview/drawing-embed-preview";
import { openInkFile } from "src/utils/open-file";
import { nanoid } from "nanoid";
import { embedShouldActivateImmediately } from "src/utils/storage";
import classNames from "classnames";
const emptyDrawingSvgStr = require('../../placeholders/empty-drawing-embed.svg');

///////
///////


export type DrawingEditorControls = {
	save: Function,
	saveAndHalt: Function,
}

export function DrawingEmbed (props: {
	plugin: InkPlugin,
	fileRef: TFile,
	pageData: InkFileData,
	save: (pageData: InkFileData) => {},
	remove: Function,
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const [state, setState] = useState<'preview'|'edit'>('preview');
	const [curPageData, setCurPageData] = useState<InkFileData>(props.pageData);
	const editorControlsRef = useRef<DrawingEditorControls>();
	const [embedId] = useState<string>(nanoid());
	const activeEmbedId = useSelector((state: GlobalSessionState) => state.activeEmbedId);
	const dispatch = useDispatch();

	// On first mount
	React.useEffect( () => {
		if(embedShouldActivateImmediately()) {
			dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
			switchToEditMode();
		}
	})

	// This fires the first time it enters edit mode
	const registerEditorControls = (handlers: DrawingEditorControls) => {
		editorControlsRef.current = handlers;
	}

	const applyStaticEmbedHeight = (height: number | null) => {
		if(!embedContainerElRef.current) return;

		if(height) {
			embedContainerElRef.current.style.height = height + 'px';
		} else {
			embedContainerElRef.current.style.height = 'unset'; // TODO: CSS transition doesn't work between number and unset
		}
	}

	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)

	let isActive = (embedId === activeEmbedId);
	if(!isActive && state === 'edit') {
		saveAndSwitchToPreviewMode();
	}

	const commonExtendedOptions = [
		{
			text: 'Copy drawing',
			action: async () => {
				await rememberDrawingFile(props.plugin, props.fileRef);
			}
		},
		{
			text: 'Open drawing',
			action: async () => {
				openInkFile(props.plugin, props.fileRef)
			}
		},
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
				'ddc_ink_drawing-embed',
			])}
			style = {{
				// Must be padding as margin creates codemirror calculation issues
				// paddingTop: state=='edit' ? '3em' : '1em',
				// paddingBottom: state=='edit' ? '2em' : '0.5em',
				paddingTop: '1em',
				paddingBottom: '0.5em',

				// height: transitioning ? staticEmbedHeight + 'px' : (state === 'edit' ? '600px' : 'auto'),
				height: state === 'edit' ? '600px' : 'auto',
			}}
		>
			{(state === 'preview') && (
				<DrawingEmbedPreview
					plugin = {props.plugin}
					onReady = {() => applyStaticEmbedHeight(null)}
					isActive = {isActive}
					src = {curPageData.previewUri || emptyDrawingSvgStr}
					// src = {previewFilePath}
					onClick = {(event) => {
						event.preventDefault();
						dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
					}}
					onEditClick = { async () => {
						const newPageData = await refreshPageData(props.plugin, props.fileRef);
						setCurPageData(newPageData);
						switchToEditMode();
					}}
					commonExtendedOptions = {commonExtendedOptions}
				/>
			)}
			{state === 'edit' && (
				<TldrawDrawingEditor
					onReady = {() => applyStaticEmbedHeight(600)}	// TODO: This should be a dynamic number as saved in the embed
					plugin = {props.plugin}
					fileRef = {props.fileRef}	// REVIEW: Convert this to an open function so the embed controls the open?
					pageData = {curPageData}
					save = {props.save}
					embedded
					registerControls = {registerEditorControls}
					closeEditor = {saveAndSwitchToPreviewMode}
					commonExtendedOptions = {commonExtendedOptions}
				/>
			)}
		</div>
	</>;

	// Helper functions
	///////////////////

	function switchToEditMode() {
		// If it already has an auto generated height, then hard code that height
		// REVIEW: WIth the new setStaticEmbedHeight method, this could be passed into the editor to control
		applyStaticEmbedHeight(embedContainerElRef.current?.offsetHeight || null);
		setState('edit');
	}

	async function saveAndSwitchToPreviewMode() {
		if(editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}
		const newPageData = await refreshPageData(props.plugin, props.fileRef);
		setCurPageData(newPageData);
		applyStaticEmbedHeight(embedContainerElRef.current?.offsetHeight || null);
		setState('preview');
	}
		
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
