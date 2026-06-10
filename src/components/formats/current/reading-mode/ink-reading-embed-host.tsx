import { MarkdownRenderChild, TFile } from 'obsidian';
import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import classNames from 'classnames';
import { DrawingEmbedPreview } from 'src/components/formats/current/drawing/drawing-embed-preview/drawing-embed-preview';
import { WritingEmbedPreview } from 'src/components/formats/current/writing/writing-embed-preview/writing-embed-preview';
import { INK_READING_ACTIVE_ATTR, INK_READING_MOUNTING_ATTR } from 'src/logic/utils/detect-reading-mode-ink-embed';
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
	private pageResizeObserver: ResizeObserver | null = null;
	private resizeContainerEl: HTMLElement | null = null;

	constructor(
		containerEl: HTMLElement,
		private readonly params: InkReadingEmbedHostParams,
	) {
		super(containerEl);
	}

	private handleWindowResize = () => {
		this.applyDimensions();
	};

	onload(): void {
		this.containerEl.removeAttribute(INK_READING_MOUNTING_ATTR);
		this.containerEl.setAttribute(INK_READING_ACTIVE_ATTR, 'true');

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
					this.resizeContainerEl = resizeContainerEl;
					this.attachResizeObserver(resizeContainerEl);
					this.attachPageResizeObserver(resizeContainerEl);
					this.applyDimensions();
				}}
			/>,
		);

		window.addEventListener('resize', this.handleWindowResize);
	}

	onunload(): void {
		window.removeEventListener('resize', this.handleWindowResize);
		this.pageResizeObserver?.disconnect();
		this.pageResizeObserver = null;
		this.resizeContainerEl = null;
		this.containerEl.removeAttribute(INK_READING_ACTIVE_ATTR);
		this.containerEl.removeAttribute(INK_READING_MOUNTING_ATTR);

		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.reactRoot?.unmount();
		this.reactRoot = null;
	}

	private applyDimensions() {
		applyReadingModeEmbedDimensions(
			this.params.embedKind,
			this.resizeContainerEl,
			this.params.embedSettings,
		);
	}

	private attachResizeObserver(resizeContainerEl: HTMLElement | null) {
		if (!resizeContainerEl) return;

		this.resizeObserver?.disconnect();
		this.resizeObserver = new ResizeObserver(() => {
			this.applyDimensions();
		});
		this.resizeObserver.observe(resizeContainerEl);
	}

	private attachPageResizeObserver(resizeContainerEl: HTMLElement | null) {
		if (!resizeContainerEl) return;

		const pageEl = resizeContainerEl.closest('.markdown-preview-view')
			?? resizeContainerEl.closest('.markdown-reading-view');
		if (!(pageEl instanceof HTMLElement)) return;

		this.pageResizeObserver?.disconnect();
		this.pageResizeObserver = new ResizeObserver(() => {
			this.applyDimensions();
		});
		this.pageResizeObserver.observe(pageEl);
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

export function applyReadingModeEmbedDimensions(
	embedKind: InkEmbedKind,
	resizeContainerEl: HTMLElement | null,
	embedSettings: EmbedSettings,
) {
	if (!resizeContainerEl) return;

	const aspectRatio = embedSettings.embedDisplay.aspectRatio
		|| DEFAULT_EMBED_SETTINGS.embedDisplay.aspectRatio;

	const configuredWidth = embedSettings.embedDisplay.width || DRAWING_INITIAL_WIDTH;
	const pageWidth = getFullPageWidth(resizeContainerEl);
	const containerWidth = resizeContainerEl.getBoundingClientRect().width;

	if (embedKind === 'drawing') {
		// Match Live Preview locked preview: saved pixel width, maxWidth caps to page when window shrinks.
		resizeContainerEl.style.width = `${configuredWidth}px`;
		resizeContainerEl.style.position = 'relative';
		resizeContainerEl.style.left = '50%';
		resizeContainerEl.style.translate = '-50%';

		if (pageWidth > 0) {
			resizeContainerEl.style.maxWidth = `${pageWidth}px`;
		}

		const renderedWidth = containerWidth > 0
			? containerWidth
			: (pageWidth > 0 ? Math.min(configuredWidth, pageWidth) : configuredWidth);
		resizeContainerEl.style.height = `${renderedWidth / aspectRatio}px`;
		return;
	}

	const writingWidth = containerWidth || pageWidth || maxFallbackWidth(resizeContainerEl);
	resizeContainerEl.style.width = '100%';
	resizeContainerEl.style.height = `${writingWidth / aspectRatio}px`;
}

/** Re-apply stored embed dimensions after the reading preview becomes visible again. */
export function refreshReadingModeEmbedDimensionsInRoot(rootEl: HTMLElement) {
	for (const hostEl of rootEl.querySelectorAll<HTMLElement>('.ddc_ink_reading-embed-host')) {
		const embedKind = hostEl.dataset.inkEmbedKind as InkEmbedKind | undefined;
		const embedSettingsJson = hostEl.dataset.inkEmbedSettings;
		if (!embedKind || !embedSettingsJson) continue;

		let embedSettings: EmbedSettings;
		try {
			embedSettings = JSON.parse(embedSettingsJson) as EmbedSettings;
		} catch {
			continue;
		}

		const resizeContainerEl = hostEl.querySelector<HTMLElement>('.ddc_ink_resize-container');
		applyReadingModeEmbedDimensions(embedKind, resizeContainerEl, embedSettings);
	}
}

function maxFallbackWidth(resizeContainerEl: HTMLElement): number {
	return getFullPageWidth(resizeContainerEl);
}
