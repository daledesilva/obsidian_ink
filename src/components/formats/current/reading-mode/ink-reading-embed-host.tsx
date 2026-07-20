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
import {
	readWritingFileAspectRatio,
} from 'src/logic/utils/writing-embed-aspect-ratio';

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
	private pageResizeObserver: ResizeObserver | null = null;
	private resizeContainerEl: HTMLElement | null = null;
	private writingFileModifyRef: ReturnType<InkPlugin['app']['vault']['on']> | null = null;

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
				sourcePath={this.params.sourcePath}
				onMount={(_embedEl, resizeContainerEl) => {
					this.resizeContainerEl = resizeContainerEl;
					this.attachResizeObserver(resizeContainerEl);
					this.attachPageResizeObserver(resizeContainerEl);
					this.applyDimensions();
					void this.syncWritingAspectRatioFromFile();
				}}
			/>,
		);

		window.addEventListener('resize', this.handleWindowResize);

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
		window.removeEventListener('resize', this.handleWindowResize);
		if (this.writingFileModifyRef) {
			this.params.plugin.app.vault.offref(this.writingFileModifyRef);
			this.writingFileModifyRef = null;
		}
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
				// Static centering/width live in SCSS; only dynamic size stays inline.
				style={props.embedKind === 'drawing'
					? {
						width: `${embedWidth}px`,
						height: `${embedWidth / embedAspectRatio}px`,
					}
					: {
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
		// Centering (position/left/translate) is in `.ddc_ink_drawing-embed .ddc_ink_resize-container` SCSS.
		resizeContainerEl.style.width = `${configuredWidth}px`;

		if (pageWidth > 0) {
			resizeContainerEl.style.maxWidth = `${pageWidth}px`;
		}

		const renderedWidth = containerWidth > 0
			? containerWidth
			: (pageWidth > 0 ? Math.min(configuredWidth, pageWidth) : configuredWidth);
		resizeContainerEl.style.height = `${renderedWidth / aspectRatio}px`;
		return;
	}

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
