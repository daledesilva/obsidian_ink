import { normalizePath } from 'obsidian';
import { parseFilepath } from 'src/logic/utils/parseFilepath';

//////////
//////////

// Capital I is intentional. A lowercase name is a different folder on case-sensitive vaults.
const WRITING_PHOTO_IMAGES_SUBFOLDER = 'Images';

/**
 * Relative path stored on `<ink source-image="…">` beside the SVG.
 */
export function buildWritingPhotoSourceImageRelativePath(jpegFileName: string): string {
	return `${WRITING_PHOTO_IMAGES_SUBFOLDER}/${jpegFileName}`;
}

/**
 * Vault path for the JPEG sibling of a writing SVG.
 */
export function buildWritingPhotoJpegVaultPath(svgVaultPath: string, jpegFileName: string): string {
	const { folderpath } = parseFilepath(svgVaultPath);
	const relative = buildWritingPhotoSourceImageRelativePath(jpegFileName);
	if (!folderpath) return normalizePath(relative);
	return normalizePath(`${folderpath}/${relative}`);
}

/**
 * Resolves `source-image` relative to the SVG file location.
 */
export function resolveWritingSourceImageVaultPath(
	svgVaultPath: string,
	sourceImageRelative: string,
): string {
	const { folderpath } = parseFilepath(svgVaultPath);
	if (!folderpath) return normalizePath(sourceImageRelative);
	return normalizePath(`${folderpath}/${sourceImageRelative}`);
}
