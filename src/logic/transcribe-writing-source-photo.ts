import { TFile } from 'obsidian';
import type { InkFileData } from 'src/components/formats/current/types/file-data';
import {
	buildHandwritingTranscriptionJobRequest,
	postHandwritingTranscriptionJob,
} from 'src/logic/almostuseful/almostuseful-handwriting-transcription';
import {
	HANDWRITING_TRANSCRIPTION_PRODUCTION_MODEL,
} from 'src/logic/handwriting-transcription-variants';
import { resolveWritingSourceImageVaultPath } from 'src/logic/photo-trace/writing-photo-paths';
import InkPlugin from 'src/main';

//////////
//////////

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

/**
 * Transcribes handwriting from the source JPEG linked on a photo-imported writing file.
 */
export async function transcribeWritingSourcePhoto(
	plugin: InkPlugin,
	svgVaultPath: string,
	pageData: InkFileData,
): Promise<string> {
	const sourceImage = pageData.meta.transcriptImage ?? pageData.meta.sourceImage;
	if (!sourceImage) {
		throw new Error('Writing file has no source photo');
	}
	const jpegPath = resolveWritingSourceImageVaultPath(svgVaultPath, sourceImage);
	const jpegFile = plugin.app.vault.getAbstractFileByPath(jpegPath);
	if (!(jpegFile instanceof TFile)) {
		throw new Error('Source photo file is missing');
	}
	const jpegBytes = await plugin.app.vault.readBinary(jpegFile);
	const mediaBase64 = arrayBufferToBase64(jpegBytes);
	const body = buildHandwritingTranscriptionJobRequest({
		mediaType: 'image/jpeg',
		mediaBase64,
		model: HANDWRITING_TRANSCRIPTION_PRODUCTION_MODEL,
	});
	const response = await postHandwritingTranscriptionJob(body);
	return response.text;
}
