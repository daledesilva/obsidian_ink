import { Component, EventRef, MarkdownRenderChild, TFile } from 'obsidian';
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
import {
	readWritingFileAspectRatio,
} from 'src/logic/utils/writing-embed-aspect-ratio';
import { useInkFileTranscript } from 'src/logic/use-ink-file-transcript';
import { useLockedInkTranscriptMode } from 'src/logic/use-ink-embed-display-mode';
import { InkEmbedDisplayModeSwitch, InkTranscriptView } from 'src/components/formats/current/ink-transcript-view/ink-transcript-view';

//////////
//////////

export type InkReadingEmbedHostParams = {
	plugin: InkPlugin;
	embedKind: InkEmbedKind;
	embeddedFile: TFile | null;
	partialEmbedFilepath: string;
	embedSettings: EmbedSettings;
	/** Note that contains this embed — used to heal stale writing aspectRatio URL params. */
	sourcePath?: string;
};

export class InkReadingEmbedHost extends MarkdownRenderChild {
	private reactRoot: Root | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private resizeContainerEl: HTMLElement | null = null;
	// Direct EventRef type, not ReturnType<...vault['on']>: the indexed-access form resolves to the
	// last `Vault.on` overload and collapses to `any` under a degraded type-checker (hosted review).
	private writingFileModifyRef: EventRef | null = null;

	constructor(
		containerEl: HTMLElement,
		private readonly params: InkReadingEmbedHostParams,
	) {
		super(containerEl);
	}

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
				sourcePath={this.params.sourcePath}
				markdownComponent={this}
				onMount={(_embedEl, resizeContainerEl) => {
					this.resizeContainerEl = resizeContainerEl;
					this.attachResizeObserver(resizeContainerEl);
					this.applyDimensions();
					void this.syncWritingAspectRatioFromFile();
				}}
			/>,
		);

		if (this.params.embedKind === 'writing' && this.params.embeddedFile) {
			const writingFilePath = this.params.embeddedFile.path;
			const onModify = (modifiedFile: TFile) => {
				if (modifiedFile.path !== writingFilePath) return;
				void this.syncWritingAspectRatioFromFile();
			};
			this.writingFileModifyRef = this.params.plugin.app.vault.on('modify', onModify);
		}
	}

	onunload(): void {
		if (this.writingFileModifyRef) {
			this.params.plugin.app.vault.offref(this.writingFileModifyRef);
			this.writingFileModifyRef = null;
		}
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

	/**
	 * Heal reading-mode writing height from the SVG viewBox.
	 * Skip note vault.modify here — rewriting markdown while mounting embeds
	 * remounts the note and can fail the first open (same as Live Preview).
	 */
	private async syncWritingAspectRatioFromFile() {
		if (this.params.embedKind !== 'writing' || !this.params.embeddedFile) return;

		const derivedAspectRatio = await readWritingFileAspectRatio(
			this.params.plugin,
			this.params.embeddedFile,
		);
		if (derivedAspectRatio == null) return;

		this.params.embedSettings.embedDisplay.aspectRatio = derivedAspectRatio;
		this.containerEl.dataset.inkEmbedSettings = JSON.stringify(this.params.embedSettings);
		this.applyDimensions();
	}

	private attachResizeObserver(resizeContainerEl: HTMLElement | null) {
		if (!resizeContainerEl) return;

		this.resizeObserver?.disconnect();
		this.resizeObserver = new ResizeObserver(() => {
			this.applyDimensions();
		});
		this.resizeObserver.observe(resizeContainerEl);

		// Also observe the reading/preview page so column width changes still
		// reflow writing height without a separate window resize listener.
		const pageEl = resizeContainerEl.closest('.markdown-preview-view')
			?? resizeContainerEl.closest('.markdown-reading-view');
		if (pageEl instanceof HTMLElement && pageEl !== resizeContainerEl) {
			this.resizeObserver.observe(pageEl);
		}
	}
}

type InkReadingEmbedContentProps = InkReadingEmbedHostParams & {
	onMount: (embedEl: HTMLElement, resizeContainerEl: HTMLElement | null) => void;
	markdownComponent: Component;
};

const InkReadingEmbedContent: React.FC<InkReadingEmbedContentProps> = (props) => {
	const embedContainerElRef = React.useRef<HTMLDivElement>(null);
	const resizeContainerElRef = React.useRef<HTMLDivElement>(null);
	const [transcriptHeightPx, setTranscriptHeightPx] = React.useState(0);

	const embedWidth = props.embedSettings.embedDisplay.width || DRAWING_INITIAL_WIDTH;
	const embedAspectRatio = props.embedSettings.embedDisplay.aspectRatio
		|| DEFAULT_EMBED_SETTINGS.embedDisplay.aspectRatio;
	const transcript = useInkFileTranscript(props.embeddedFile);
	const { hasTranscript, showTranscript } = useLockedInkTranscriptMode(
		props.embeddedFile?.path,
		transcript,
		false,
	);

	let drawingHeightPx = embedWidth / embedAspectRatio;
	const transcriptHeightIsReady = showTranscript && transcriptHeightPx > 0;
	if (transcriptHeightIsReady) {
		drawingHeightPx = transcriptHeightPx;
	}

	// Until the markdown has been measured, keep the SVG aspect height so the card
	// does not collapse. After that, the attribute tells dimension refresh to leave it.
	let resizeStyle: React.CSSProperties = { position: 'relative' };
	if (props.embedKind === 'drawing') {
		resizeStyle = {
			width: `${embedWidth}px`,
			height: `${drawingHeightPx}px`,
		};
	} else if (transcriptHeightIsReady) {
		resizeStyle = {
			position: 'relative',
			height: `${transcriptHeightPx}px`,
		};
	}

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
		showTranscript,
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
				data-ink-display-mode={transcriptHeightIsReady ? 'text' : undefined}
				// Static centering/width live in SCSS; only dynamic size stays inline.
				style={resizeStyle}
			>
				{showTranscript && transcript && (
					<InkTranscriptView
						app={props.plugin.app}
						markdown={transcript}
						sourcePath={props.sourcePath ?? ''}
						parentComponent={props.markdownComponent}
						onHeightChange={applyTranscriptHeight}
					/>
				)}
				{!showTranscript && props.embedKind === 'drawing' && (
					<DrawingEmbedPreview
						key={props.embeddedFile.path}
						embeddedFile={props.embeddedFile}
						embedSettings={props.embedSettings}
						onReady={() => {}}
						onClick={() => {}}
					/>
				)}
				{!showTranscript && props.embedKind !== 'drawing' && (
					<WritingEmbedPreview
						plugin={props.plugin}
						writingFile={props.embeddedFile}
						onResize={() => {}}
						onClick={() => {}}
					/>
				)}
				{hasTranscript && props.embeddedFile && (
					<InkEmbedDisplayModeSwitch
						filePath={props.embeddedFile.path}
						inkIconKind={props.embedKind === 'drawing' ? 'drawing' : 'writing'}
					/>
				)}
			</div>
		</div>
	);

	function applyTranscriptHeight(heightPx: number) {
		if (heightPx <= 0) return;
		setTranscriptHeightPx((currentHeightPx) => {
			const heightIsUnchanged = Math.abs(currentHeightPx - heightPx) <= 1;
			if (heightIsUnchanged) return currentHeightPx;
			return heightPx;
		});
		const resizeContainerEl = resizeContainerElRef.current;
		if (!resizeContainerEl) return;
		// Set before the height write so a ResizeObserver pass does not restore aspect ratio.
		resizeContainerEl.setAttribute('data-ink-display-mode', 'text');
		resizeContainerEl.style.height = `${heightPx}px`;
	}
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
	// Text mode height follows rendered markdown. Aspect-ratio height would clip it.
	const isTranscriptMode = resizeContainerEl.getAttribute('data-ink-display-mode') === 'text';

	if (embedKind === 'drawing') {
		// Match Live Preview locked preview: saved pixel width, maxWidth caps to page when window shrinks.
		// Centering (position/left/translate) is in `.ddc_ink_drawing-embed .ddc_ink_resize-container` SCSS.
		resizeContainerEl.style.width = `${configuredWidth}px`;

		if (pageWidth > 0) {
			resizeContainerEl.style.maxWidth = `${pageWidth}px`;
		}

		const renderedWidth = containerWidth > 0
			? containerWidth
			: (pageWidth > 0 ? Math.min(configuredWidth, pageWidth) : configuredWidth);
		if (!isTranscriptMode) {
			resizeContainerEl.style.height = `${renderedWidth / aspectRatio}px`;
		}
		return;
	}

	if (isTranscriptMode) return;

	// Width 100% comes from `.ddc_ink_resize-container` in writing-embed.scss.
	const writingWidth = containerWidth || pageWidth || maxFallbackWidth(resizeContainerEl);
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
