import { MarkdownRenderChild, TFile } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import classNames from 'classnames';
import { DrawingEmbedPreview } from 'src/components/formats/current/drawing/drawing-embed-preview/drawing-embed-preview';
import { WritingEmbedPreview } from 'src/components/formats/current/writing/writing-embed-preview/writing-embed-preview';
import { applyReadingModeAncestorStyling, InkEmbedKind } from 'src/logic/utils/embed';
import { getFullPageWidth } from 'src/logic/utils/getFullPageWidth';
import { DRAWING_INITIAL_WIDTH } from 'src/constants';
import { DEFAULT_EMBED_SETTINGS, EmbedSettings } from 'src/types/embed-settings';
import InkPlugin from 'src/main';

//////////
//////////

export type InkReadingEmbedHostParams = {
	plugin: InkPlugin;
	embedKind: InkEmbedKind;
	embeddedFile: TFile | null;
	partialEmbedFilepath: string;
	embedSettings: EmbedSettings;
};

export class InkReadingEmbedHost extends MarkdownRenderChild {
	private reactRoot: Root | null = null;
	private resizeObserver: ResizeObserver | null = null;

	constructor(
		containerEl: HTMLElement,
		private readonly params: InkReadingEmbedHostParams,
	) {
		super(containerEl);
	}

	onload(): void {
		applyReadingModeAncestorStyling(this.containerEl, this.params.embedKind);

		this.reactRoot = createRoot(this.containerEl);
		this.reactRoot.render(
			<InkReadingEmbedContent
				plugin={this.params.plugin}
				embedKind={this.params.embedKind}
				embeddedFile={this.params.embeddedFile}
				partialEmbedFilepath={this.params.partialEmbedFilepath}
				embedSettings={this.params.embedSettings}
				onMount={(_embedEl, resizeContainerEl) => {
					this.attachResizeObserver(resizeContainerEl);
				}}
			/>,
		);
	}

	onunload(): void {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.reactRoot?.unmount();
		this.reactRoot = null;
	}

	private attachResizeObserver(resizeContainerEl: HTMLElement | null) {
		if (!resizeContainerEl) return;

		this.resizeObserver?.disconnect();
		this.resizeObserver = new ResizeObserver(() => {
			applyReadingModeEmbedDimensions(
				this.params.embedKind,
				resizeContainerEl,
				this.params.embedSettings,
			);
		});
		this.resizeObserver.observe(resizeContainerEl);
	}
}

type InkReadingEmbedContentProps = InkReadingEmbedHostParams & {
	onMount: (embedEl: HTMLElement, resizeContainerEl: HTMLElement | null) => void;
};

const InkReadingEmbedContent: React.FC<InkReadingEmbedContentProps> = (props) => {
	const embedContainerElRef = React.useRef<HTMLDivElement>(null);
	const resizeContainerElRef = React.useRef<HTMLDivElement>(null);

	const embedWidth = props.embedSettings.embedDisplay.width || DRAWING_INITIAL_WIDTH;
	const embedAspectRatio = props.embedSettings.embedDisplay.aspectRatio
		|| DEFAULT_EMBED_SETTINGS.embedDisplay.aspectRatio;

	React.useLayoutEffect(() => {
		const embedEl = embedContainerElRef.current;
		const resizeContainerEl = resizeContainerElRef.current;
		if (!embedEl) return;

		applyReadingModeEmbedDimensions(props.embedKind, resizeContainerEl, props.embedSettings);
		props.onMount(embedEl, resizeContainerEl);
	}, [
		props.embedKind,
		props.embedSettings.embedDisplay.width,
		props.embedSettings.embedDisplay.aspectRatio,
		props.embeddedFile?.path,
	]);

	if (!props.embeddedFile) {
		const notFoundLabel = props.embedKind === 'drawing' ? 'Drawing' : 'Writing';
		return (
			<div className={classNames('ddc_ink_embed', embedOuterClass(props.embedKind))}>
				<div className='ddc_ink_pending-banner ddc_ink_pending-banner--not-found'>
					<span className='ddc_ink_pending-banner__title'>
						{notFoundLabel} file not found: {props.partialEmbedFilepath}
					</span>
				</div>
			</div>
		);
	}

	return (
		<div
			ref={embedContainerElRef}
			className={classNames('ddc_ink_embed', embedOuterClass(props.embedKind))}
			style={{
				paddingTop: '1em',
				paddingBottom: '0.5em',
			}}
		>
			<div
				ref={resizeContainerElRef}
				className='ddc_ink_resize-container'
				style={props.embedKind === 'drawing'
					? {
						width: `${embedWidth}px`,
						height: `${embedWidth / embedAspectRatio}px`,
						position: 'relative',
						left: '50%',
						translate: '-50%',
					}
					: {
						width: '100%',
						position: 'relative',
					}}
			>
				{props.embedKind === 'drawing' ? (
					<DrawingEmbedPreview
						key={props.embeddedFile.path}
						embeddedFile={props.embeddedFile}
						embedSettings={props.embedSettings}
						onReady={() => {}}
						onClick={() => {}}
					/>
				) : (
					<WritingEmbedPreview
						plugin={props.plugin}
						writingFile={props.embeddedFile}
						onResize={() => {}}
						onClick={() => {}}
					/>
				)}
			</div>
		</div>
	);
};

function embedOuterClass(embedKind: InkEmbedKind): string {
	return embedKind === 'drawing' ? 'ddc_ink_drawing-embed' : 'ddc_ink_writing-embed';
}

function applyReadingModeEmbedDimensions(
	embedKind: InkEmbedKind,
	resizeContainerEl: HTMLElement | null,
	embedSettings: EmbedSettings,
) {
	if (!resizeContainerEl) return;

	const aspectRatio = embedSettings.embedDisplay.aspectRatio
		|| DEFAULT_EMBED_SETTINGS.embedDisplay.aspectRatio;

	if (embedKind === 'drawing') {
		const maxWidth = getFullPageWidth(resizeContainerEl);
		const width = Math.min(
			embedSettings.embedDisplay.width || DRAWING_INITIAL_WIDTH,
			maxWidth,
		);
		resizeContainerEl.style.maxWidth = `${maxWidth}px`;
		resizeContainerEl.style.width = `${width}px`;
		resizeContainerEl.style.height = `${width / aspectRatio}px`;
		return;
	}

	const containerWidth = resizeContainerEl.getBoundingClientRect().width || maxFallbackWidth(resizeContainerEl);
	resizeContainerEl.style.width = '100%';
	resizeContainerEl.style.height = `${containerWidth / aspectRatio}px`;
}

function maxFallbackWidth(resizeContainerEl: HTMLElement): number {
	return getFullPageWidth(resizeContainerEl);
}
