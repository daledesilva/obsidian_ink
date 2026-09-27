import './ink-transcript-view.scss';
import * as React from 'react';
import { useEffect, useRef } from 'react';
import { App, Component, MarkdownRenderer } from 'obsidian';
import {
	setInkEmbedDisplayMode,
	type InkEmbedDisplayMode,
} from 'src/logic/ink-embed-display-mode';
import { useInkEmbedDisplayMode } from 'src/logic/use-ink-embed-display-mode';
import { useHandwritingTranscriptionQueueStatus } from 'src/logic/use-handwriting-transcription-queue-status';
import { WriteIcon } from 'src/graphics/icons/write-icon';
import { DrawIcon } from 'src/graphics/icons/draw-icon';
import { TextModeIcon } from 'src/graphics/icons/text-mode-icon';
import { Loader2Icon } from 'src/graphics/icons/loader-2-icon';
import { ClockIcon } from 'src/graphics/icons/clock-icon';
import { normalizeInkTranscriptMarkdown } from 'src/logic/normalize-ink-transcript-markdown';

//////////
//////////

export interface InkTranscriptViewProps {
	app: App;
	markdown: string;
	/** Note that contains the embed, so wikilinks resolve from there. */
	sourcePath: string;
	/**
	 * When set (reading mode), rendered child components unload with the host.
	 * Live Preview creates a standalone Component instead.
	 */
	parentComponent?: Component;
	onHeightChange?: (heightPx: number) => void;
}

/** Non-editable, selectable render of an ink SVG's markdown transcript. */
export function InkTranscriptView(props: InkTranscriptViewProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const onHeightChangeRef = useRef(props.onHeightChange);
	onHeightChangeRef.current = props.onHeightChange;

	useEffect(() => {
		const hostEl = hostRef.current;
		if (!hostEl) return;

		const mount = new Component();
		if (props.parentComponent) {
			props.parentComponent.addChild(mount);
		} else {
			mount.load();
		}

		let cancelled = false;
		hostEl.replaceChildren();

		const reportHeight = () => {
			if (cancelled) return;
			onHeightChangeRef.current?.(hostEl.offsetHeight);
		};

		// Flourish glyphs only. Blank lines stay: they are real list and paragraph breaks.
		const markdown = normalizeInkTranscriptMarkdown(props.markdown);
		void MarkdownRenderer.render(
			props.app,
			markdown,
			hostEl,
			props.sourcePath,
			mount,
		).then(() => {
			reportHeight();
		});

		// Images and post-processors can change height after the first paint.
		const observer = new ResizeObserver(() => {
			reportHeight();
		});
		observer.observe(hostEl);

		return () => {
			cancelled = true;
			observer.disconnect();
			if (props.parentComponent) {
				props.parentComponent.removeChild(mount);
			} else {
				mount.unload();
			}
			hostEl.replaceChildren();
		};
	}, [props.app, props.markdown, props.sourcePath, props.parentComponent]);

	return (
		<div
			ref={hostRef}
			className='ddc_ink_transcript-view ddc_ink_transcript-view--framed markdown-rendered'
			// Live Preview's editor handles mousedown on the widget unless it stops here.
			onMouseDown={(event) => {
				event.stopPropagation();
			}}
		/>
	);
}

export interface InkEmbedDisplayModeSwitchProps {
	filePath: string;
	inkIconKind: 'writing' | 'drawing';
}

export interface InkEmbedTranscriptControlsProps {
	filePath: string;
	inkIconKind: 'writing' | 'drawing';
}

/** Top-right cluster: transcription queue status (when active) plus ink/transcript toggle. */
export function InkEmbedTranscriptControls(props: InkEmbedTranscriptControlsProps) {
	const queueStatus = useHandwritingTranscriptionQueueStatus(props.filePath);

	let statusAriaLabel: string | undefined;
	if (queueStatus === 'processing') statusAriaLabel = 'Transcribing…';
	if (queueStatus === 'queued') statusAriaLabel = 'Transcription queued';

	return (
		<div className='ddc_ink_display-mode-controls'>
			{queueStatus && (
				<span
					className={`ddc_ink_transcript-queue-status ddc_ink_transcript-queue-status--${queueStatus}`}
					aria-label={statusAriaLabel}
				>
					{queueStatus === 'processing' ? <Loader2Icon /> : <ClockIcon />}
				</span>
			)}
			<InkEmbedDisplayModeSwitch
				filePath={props.filePath}
				inkIconKind={props.inkIconKind}
			/>
		</div>
	);
}

/** Circular toggle between ink preview and transcript on a locked embed. */
export function InkEmbedDisplayModeSwitch(props: InkEmbedDisplayModeSwitchProps) {
	const mode = useInkEmbedDisplayMode(props.filePath);

	let nextMode: InkEmbedDisplayMode = 'text';
	if (mode === 'text') {
		nextMode = 'ink';
	}

	let ariaLabel = 'Show transcript';
	if (mode === 'text') {
		ariaLabel = 'Show ink';
	}

	return (
		<button
			type='button'
			className='ddc_ink_display-mode-toggle'
			aria-label={ariaLabel}
			onMouseDown={(event) => {
				event.stopPropagation();
			}}
			onClick={() => {
				setInkEmbedDisplayMode(props.filePath, nextMode);
			}}
		>
			{mode === 'text' ? (
				props.inkIconKind === 'drawing' ? <DrawIcon /> : <WriteIcon />
			) : (
				<TextModeIcon />
			)}
		</button>
	);
}
