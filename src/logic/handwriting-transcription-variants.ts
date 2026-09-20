import {
	buildHandwritingTranscriptionJobRequest,
	HANDWRITING_TRANSCRIPTION_MODELS,
	type HandwritingTranscriptionJobResponse,
	type HandwritingTranscriptionMediaType,
	type HandwritingTranscriptionModel,
	postHandwritingTranscriptionJob,
} from 'src/logic/almostuseful/almostuseful-handwriting-transcription';
import { stripWritingSvgToVisualOnly } from 'src/logic/utils/strip-writing-svg-to-visual-only';
import { writingSvgToPngBase64 } from 'src/logic/utils/writing-svg-to-png-base64';

//////////
//////////

export type HandwritingTranscriptionVariantId =
	| 'svg-gemini-flash-lite'
	| 'png-gemini-flash-lite'
	| 'svg-gpt5-nano'
	| 'png-gpt5-nano';

export interface HandwritingTranscriptionVariantConfig {
	id: HandwritingTranscriptionVariantId;
	mediaType: HandwritingTranscriptionMediaType;
	model: HandwritingTranscriptionModel;
}

export const HANDWRITING_TRANSCRIPTION_VARIANTS: HandwritingTranscriptionVariantConfig[] = [
	{
		id: 'svg-gemini-flash-lite',
		mediaType: 'image/svg+xml',
		model: HANDWRITING_TRANSCRIPTION_MODELS.geminiFlashLite,
	},
	{
		id: 'png-gemini-flash-lite',
		mediaType: 'image/png',
		model: HANDWRITING_TRANSCRIPTION_MODELS.geminiFlashLite,
	},
	{
		id: 'svg-gpt5-nano',
		mediaType: 'image/svg+xml',
		model: HANDWRITING_TRANSCRIPTION_MODELS.gpt5Nano,
	},
	{
		id: 'png-gpt5-nano',
		mediaType: 'image/png',
		model: HANDWRITING_TRANSCRIPTION_MODELS.gpt5Nano,
	},
];

export function getHandwritingTranscriptionVariant(
	variantId: HandwritingTranscriptionVariantId,
): HandwritingTranscriptionVariantConfig {
	const variant = HANDWRITING_TRANSCRIPTION_VARIANTS.find((entry) => entry.id === variantId);
	if (!variant) {
		throw new Error(`Unknown handwriting transcription variant: ${variantId}`);
	}
	return variant;
}

/** UTF-8 SVG string → base64 without a data-URI prefix. */
export function encodeUtf8TextToBase64(text: string): string {
	if (typeof Buffer !== 'undefined') {
		return Buffer.from(text, 'utf8').toString('base64');
	}
	const bytes = new TextEncoder().encode(text);
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

export interface PrepareHandwritingTranscriptionMediaOptions {
	/** Injectable for Jest — skips Canvg when PNG variants are not under test. */
	pngBase64?: string;
	createCanvas?: () => HTMLCanvasElement;
}

/**
 * Builds portal media payload from a full writing SVG file string.
 */
export async function prepareHandwritingTranscriptionMedia(
	variant: HandwritingTranscriptionVariantConfig,
	writingSvgFileContent: string,
	options?: PrepareHandwritingTranscriptionMediaOptions,
): Promise<{ mediaType: HandwritingTranscriptionMediaType; mediaBase64: string }> {
	const visualSvg = stripWritingSvgToVisualOnly(writingSvgFileContent);
	if (variant.mediaType === 'image/svg+xml') {
		return {
			mediaType: 'image/svg+xml',
			mediaBase64: encodeUtf8TextToBase64(visualSvg),
		};
	}

	const pngBase64 =
		options?.pngBase64 ??
		await writingSvgToPngBase64(visualSvg, { createCanvas: options?.createCanvas });
	if (!pngBase64) {
		throw new Error('Failed to rasterize writing SVG to PNG');
	}
	return {
		mediaType: 'image/png',
		mediaBase64: pngBase64,
	};
}

export interface TranscribeHandwritingVariantOptions extends PrepareHandwritingTranscriptionMediaOptions {
	accessToken?: string;
	idempotencyKey?: string;
}

/**
 * Eval entry point: one variant × one writing SVG. Not wired to the editor UI yet.
 */
export async function transcribeHandwritingVariant(
	variantId: HandwritingTranscriptionVariantId,
	writingSvgFileContent: string,
	options?: TranscribeHandwritingVariantOptions,
): Promise<HandwritingTranscriptionJobResponse & { variantId: HandwritingTranscriptionVariantId }> {
	const variant = getHandwritingTranscriptionVariant(variantId);
	const media = await prepareHandwritingTranscriptionMedia(
		variant,
		writingSvgFileContent,
		options,
	);
	const body = buildHandwritingTranscriptionJobRequest({
		mediaType: media.mediaType,
		mediaBase64: media.mediaBase64,
		model: variant.model,
		idempotencyKey: options?.idempotencyKey,
	});
	const response = await postHandwritingTranscriptionJob(body, {
		accessToken: options?.accessToken,
	});
	return { ...response, variantId };
}
