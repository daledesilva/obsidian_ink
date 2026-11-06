import { HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES } from 'src/logic/almostuseful/handwriting-transcription-media-limit';
import { rotateImageDataQuarterTurns } from 'src/logic/photo-trace/rotate-image-data';
import { canvasFromRgba } from 'src/logic/photo-trace/run-photo-trace';

//////////
//////////

const PHOTO_LONG_EDGE_PX = 1600;
const INITIAL_JPEG_QUALITY = 0.85;

/**
 * Resizes a picked photo and encodes JPEG bytes under the portal transcription cap.
 * Quarter turns match the corner step so the vault file is the orientation the user chose.
 */
export async function encodeWritingPhotoJpeg(
	blob: Blob,
	quarterTurnsClockwise = 0,
): Promise<ArrayBuffer> {
	const bitmap = await createImageBitmap(blob);
	const longEdge = Math.max(bitmap.width, bitmap.height);
	const scale = longEdge > PHOTO_LONG_EDGE_PX ? PHOTO_LONG_EDGE_PX / longEdge : 1;
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) {
		bitmap.close();
		throw new Error('Could not prepare photo for saving');
	}
	context.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();
	const scaled = context.getImageData(0, 0, width, height);
	const oriented = rotateImageDataQuarterTurns(scaled, quarterTurnsClockwise);
	const outputCanvas = canvasFromRgba(oriented.data, oriented.width, oriented.height);
	let quality = INITIAL_JPEG_QUALITY;
	let lastBuffer: ArrayBuffer | null = null;
	while (quality >= 0.35) {
		const encoded = await canvasToJpegArrayBuffer(outputCanvas, quality);
		lastBuffer = encoded;
		if (encoded.byteLength <= HANDWRITING_TRANSCRIPTION_MAX_MEDIA_BYTES) {
			return encoded;
		}
		quality -= 0.1;
	}
	if (lastBuffer) return lastBuffer;
	throw new Error('Photo is too large to save');
}

function canvasToJpegArrayBuffer(canvas: HTMLCanvasElement, quality: number): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((jpegBlob) => {
			if (!jpegBlob) {
				reject(new Error('Could not encode JPEG'));
				return;
			}
			void jpegBlob.arrayBuffer().then(resolve).catch(reject);
		}, 'image/jpeg', quality);
	});
}
