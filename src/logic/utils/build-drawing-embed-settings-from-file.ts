import type { TFile } from 'obsidian';
import type InkPlugin from 'src/main';
import { computeStrokesBounds } from 'src/ink-canvas/svg-export';
import { embedViewBoxFromCamera, fitBoundsToViewport } from 'src/ink-canvas/camera';
import type { InkStroke } from 'src/ink-canvas/types';
import { getInkStrokesFromSvg } from 'src/logic/utils/ink-file-has-strokes';
import { DEFAULT_EMBED_SETTINGS, type EmbedSettings } from 'src/types/embed-settings';

const EMBED_FIT_PADDING_PX = 16;

function cloneDefaultEmbedSettings(): EmbedSettings {
	return {
		...DEFAULT_EMBED_SETTINGS,
		embedDisplay: { ...DEFAULT_EMBED_SETTINGS.embedDisplay },
		viewBox: { ...DEFAULT_EMBED_SETTINGS.viewBox },
	};
}

function buildEmbedSettingsWithFittedViewBox(strokes: InkStroke[]): EmbedSettings {
	const embedDisplay = { ...DEFAULT_EMBED_SETTINGS.embedDisplay };
	const viewportWidth = embedDisplay.width;
	const viewportHeight = viewportWidth / embedDisplay.aspectRatio;

	const bounds = computeStrokesBounds(strokes);
	const camera = fitBoundsToViewport(
		viewportWidth,
		viewportHeight,
		{
			x: bounds.minX,
			y: bounds.minY,
			width: bounds.width,
			height: bounds.height,
		},
		EMBED_FIT_PADDING_PX,
	);

	return {
		...DEFAULT_EMBED_SETTINGS,
		embedDisplay,
		viewBox: embedViewBoxFromCamera(camera, viewportWidth, viewportHeight),
	};
}

/** Embed settings with viewBox fitted to stroke bounds, or null when strokes cannot be fitted. */
export function buildDrawingEmbedSettingsFromStrokes(strokes: InkStroke[]): EmbedSettings | null {
	if (strokes.length === 0) return null;

	const bounds = computeStrokesBounds(strokes);
	if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)
		|| bounds.width <= 0 || bounds.height <= 0) {
		return null;
	}

	return buildEmbedSettingsWithFittedViewBox(strokes);
}

/** Embed settings with viewBox fitted to all strokes (insert-existing drawing). */
export async function buildDrawingEmbedSettingsFromFile(
	plugin: InkPlugin,
	file: TFile,
): Promise<EmbedSettings> {
	try {
		const svgString = await plugin.app.vault.read(file);
		const strokes = getInkStrokesFromSvg(svgString);
		return buildDrawingEmbedSettingsFromStrokes(strokes) ?? cloneDefaultEmbedSettings();
	} catch {
		return cloneDefaultEmbedSettings();
	}
}
