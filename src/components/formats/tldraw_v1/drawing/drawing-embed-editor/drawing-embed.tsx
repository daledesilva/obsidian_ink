import "./drawing-embed.scss";
import * as React from "react";
import { useRef } from "react";
import { TldrawDrawingEditorWrapper } from "../tldraw-drawing-editor/tldraw-drawing-editor";
import InkPlugin from "src/main";
import { InkFileData } from "src/components/formats/tldraw_v1/types/file-data";
import { openInkFile } from "src/logic/utils/open-file";
import { embedShouldActivateImmediately } from "src/logic/utils/storage";
import { getFullPageWidth } from "src/logic/utils/getFullPageWidth";
import { verbose } from "src/logic/utils/log-to-console";
import { rememberDrawingFile } from "src/logic/utils/rememberDrawingFile";
import { TFile } from "obsidian";
import { DrawingEmbedPreviewWrapper } from "../drawing-embed-preview/drawing-embed-preview";
import classNames from "classnames";
import { atom, useSetAtom } from "jotai";
import { DRAWING_INITIAL_WIDTH, DRAWING_INITIAL_ASPECT_RATIO } from "src/constants";
 
const emptyDrawingSvgStr = require('src/defaults/empty-drawing-embed.svg');

///////
///////


export enum DrawingEmbedState {
	preview = 'preview',
	loadingEditor = 'loadingEditor',
	editor = 'editor',
	loadingPreview = 'unloadingEditor',
}
export const embedStateAtom = atom(DrawingEmbedState.preview)
export const previewActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== DrawingEmbedState.editor
})
export const editorActiveAtom = atom<boolean>((get) => {
	const embedState = get(embedStateAtom);
	return embedState !== DrawingEmbedState.preview
})

///////

export type DrawingEditorControls = {
	save: Function,
	saveAndHalt: Function,
}

export function DrawingEmbed (props: {
	plugin: InkPlugin,
	drawingFileRef: TFile,
	pageData: InkFileData,
	saveSrcFile: (pageData: InkFileData) => {},
	setEmbedProps: (width: number, height: number) => void,
	remove: Function,
	width?: number,
	aspectRatio?: number,
}) {
	const embedContainerElRef = useRef<HTMLDivElement>(null);
	const resizeContainerElRef = useRef<HTMLDivElement>(null);
	const editorControlsRef = useRef<DrawingEditorControls>();
	const embedWidthRef = useRef<number>(props.width || DRAWING_INITIAL_WIDTH);
	const embedAspectRatioRef = useRef<number>(props.aspectRatio || DRAWING_INITIAL_ASPECT_RATIO);
	// const previewFilePath = getPreviewFileResourcePath(props.plugin, props.fileRef)
	// const [embedId] = useState<string>(nanoid());
	// const activeEmbedId = useSelector((state: GlobalSessionState) => state.activeEmbedId);
	// const dispatch = useDispatch();

	const setEmbedState = useSetAtom(embedStateAtom);

	// On first mount
	React.useEffect( () => {
		if(embedShouldActivateImmediately()) {
			// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
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

	// let isActive = (embedId === activeEmbedId);
	// if(!isActive && state === 'edit') {
	// 	saveAndSwitchToPreviewMode();
	// }

	const commonExtendedOptions = [
		{
			text: 'Copy drawing',
			action: async () => {
				await rememberDrawingFile(props.drawingFileRef);
			}
		},
		{
			text: 'Open drawing',
			action: async () => {
				openInkFile(props.drawingFileRef)
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
				paddingTop: '1em',
				paddingBottom: '0.5em',
			}}
		>
			{/* Include another container so that it's height isn't affected by the padding of the outer container */}
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
					plugin = {props.plugin}
					onReady = {() => {}}
					drawingFile = {props.drawingFileRef}
					onClick = { async () => {
						// dispatch({ type: 'global-session/setActiveEmbedId', payload: embedId })
						switchToEditMode();
					}}
				/>
			
				<TldrawDrawingEditorWrapper
					onReady = {() => {}}
					plugin = {props.plugin}
					drawingFile = {props.drawingFileRef}
					save = {props.saveSrcFile}
					embedded
					saveControlsReference = {registerEditorControls}
					closeEditor = {saveAndSwitchToPreviewMode}
					extendedMenu = {commonExtendedOptions}
					resizeEmbed = {resizeEmbed}
				/>

			</div>				
		</div>
	</>;

	//// Helper functions
	/////////////////////

	function registerEditorControls(handlers: DrawingEditorControls) {
		editorControlsRef.current = handlers;
	}

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
		// props.setEmbedProps(embedHeightRef.current); // NOTE: Can't do this here because it causes the embed to reload
	}
	function applyEmbedHeight() {
		if(!resizeContainerElRef.current) return;
		resizeContainerElRef.current.style.width = embedWidthRef.current + 'px';
		const curWidth = resizeContainerElRef.current.getBoundingClientRect().width;
		resizeContainerElRef.current.style.height = curWidth/embedAspectRatioRef.current + 'px';
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
		verbose('Set DrawingEmbedState: loadingEditor')
		applyEmbedHeight();
		setEmbedState(DrawingEmbedState.loadingEditor);
	}

	async function saveAndSwitchToPreviewMode() {
		verbose('Set DrawingEmbedState: loadingPreview');

		if(editorControlsRef.current) {
			await editorControlsRef.current.saveAndHalt();
		}
		
		setEmbedState(DrawingEmbedState.loadingPreview);
		props.setEmbedProps(embedWidthRef.current, embedAspectRatioRef.current);
	}

	function handleResize() {
		const maxWidth = getFullPageWidth(embedContainerElRef.current);
		if (resizeContainerElRef.current) {
			resizeContainerElRef.current.style.maxWidth = maxWidth + 'px';
			const curWidth = resizeContainerElRef.current.getBoundingClientRect().width;
			resizeContainerElRef.current.style.height = curWidth/embedAspectRatioRef.current + 'px';
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
