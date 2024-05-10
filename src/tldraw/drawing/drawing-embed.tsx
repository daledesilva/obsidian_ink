import "./drawing-embed.scss";
import * as React from "react";
import { useRef, useState } from "react";
import { TldrawDrawingEditor } from "./tldraw-drawing-editor";
import InkPlugin from "../../main";
import { InkFileData } from "../../utils/page-file";
import { TFile } from "obsidian";
import { duplicateDrawingFile, rememberDrawingFile } from "src/utils/file-manipulation";
import { isEmptyDrawingFile } from "src/utils/tldraw-helpers";
import { GlobalSessionState } from "src/logic/stores";
import { useDispatch, useSelector } from "react-redux";
import { DrawingEmbedPreview } from "./drawing-embed-preview/drawing-embed-preview";
import { openInkFile } from "src/utils/open-file";

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
}) {
	// const assetUrls = getAssetUrlsByMetaUrl();
	const embedContainerRef = useRef<HTMLDivElement>(null);
	const [state, setState] = useState<'preview'|'edit'>('preview');
	const [transitioning, setTransitioning] = useState<boolean>(false);
	const isEditModeForScreenshottingRef = useRef<boolean>(false);
	const [curPageData, setCurPageData] = useState<InkFileData>(props.pageData);
	const editorControlsRef = useRef<DrawingEditorControls>();
	const [embedId] = useState<string>(crypto.randomUUID());
	const activeEmbedId = useSelector((state: GlobalSessionState) => state.activeEmbedId);
	const dispatch = useDispatch();
	const [staticEmbedHeight, setStaticEmbedHeight] = useState<number>(0);
		
	// Whenever switching between readonly and edit mode
	React.useEffect( () => {
		
		if(state === 'preview') {
			// It's not edit mode

			if(isEmptyDrawingFile(curPageData.tldraw)) {
				switchToEditMode();
				
			} else if(!curPageData.previewUri) {
				// console.log("Switching to edit mode for writing screenshot")
				switchToEditMode();
				isEditModeForScreenshottingRef.current = true;
			}

		} else {
			// It IS edit mode
			
			if(isEditModeForScreenshottingRef.current) takeScreenshotAndReturn();
		}	

	}, [state])

	const registerEditorControls = (handlers: DrawingEditorControls) => {
		editorControlsRef.current = handlers;
	}

	const takeScreenshotAndReturn = async () => {
		// console.log('Taking drawing screenshot and switching back to read-only mode');
		if(!editorControlsRef.current) return;
		isEditModeForScreenshottingRef.current = false;
		
		await editorControlsRef.current.saveAndHalt();
		const newPageData = await refreshPageData(props.plugin, props.fileRef);
		setCurPageData(newPageData);
		switchToPreviewMode();
	}

	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)

	let isActive = embedId === activeEmbedId;
	if(!isActive && state === 'edit') switchToReadOnlyIfStarted();

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
	]

	return <>
		<div
			ref = {embedContainerRef}
			className = 'ink_drawing-embed'
			style = {{
				// Must be padding as margin creates codemirror calculation issues
				paddingTop: state=='edit' ? '3em' : '1em',
				paddingBottom: state=='edit' ? '2em' : '0.5em',
				height: state === 'edit' ? '600px' : 'auto',
			}}
		>
			{(state === 'preview' && !curPageData.previewUri) && (
				<p>This should never be show</p>
			)}
			{(state === 'preview' && curPageData.previewUri) && (
				<DrawingEmbedPreview
					onReady = {() => setTransitioning(false)}
					isActive = {isActive}
					src = {curPageData.previewUri}
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
					onReady = {() => setTransitioning(false)}
					plugin = {props.plugin}
					fileRef = {props.fileRef}	// REVIEW: Convert this to an open function so the embed controls the open?
					pageData = {curPageData}
					save = {props.save}
					embedded
					registerControls = {registerEditorControls}
					switchToReadOnly = {switchToReadOnlyIfStarted}
					commonExtendedOptions = {commonExtendedOptions}
				/>
			)}
		</div>
	</>;

	// Helper functions
	///////////////////

	function switchToEditMode() {
		setStaticEmbedHeight(embedContainerRef.current?.offsetHeight || 0);
		setTransitioning(true);
		setState('edit');
	}

	function switchToPreviewMode() {
		setStaticEmbedHeight(embedContainerRef.current?.offsetHeight || 0);
		setTransitioning(true);
		setState('preview');
	}
	
	async function switchToReadOnlyIfStarted() {
		const newPageData = await refreshPageData(props.plugin, props.fileRef);
		
		// Don't switch to readonly if it hasn't been started (It's empty so there's no screenshot to show).
		if(!isEmptyDrawingFile(newPageData.tldraw)) {
			// console.log(`Isn't an empty writing file --------`);
			await editorControlsRef.current?.saveAndHalt();
			setCurPageData(newPageData);
			switchToPreviewMode();
		}
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
