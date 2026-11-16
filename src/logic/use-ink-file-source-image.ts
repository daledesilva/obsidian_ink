import { useEffect, useState } from 'react';
import { TFile } from 'obsidian';
import type InkPlugin from 'src/main';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { resolveWritingSourceImageVaultPath } from 'src/logic/photo-trace/writing-photo-paths';

//////////
//////////

/**
 * Resolves the vault resource URL for a writing file's linked source photo, if any.
 */
export function useInkFileSourceImageUrl(
	plugin: InkPlugin,
	writingFile: TFile | null | undefined,
): string | null {
	const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!writingFile) {
			setSourceImageUrl(null);
			return;
		}
		let cancelled = false;
		const loadSourceImage = async (): Promise<void> => {
			try {
				const svgContent = await plugin.app.vault.read(writingFile);
				const pageData = extractInkJsonFromSvg(svgContent);
				const sourceImageRelative = pageData?.meta.sourceImage;
				if (!sourceImageRelative) {
					if (!cancelled) setSourceImageUrl(null);
					return;
				}
				const jpegPath = resolveWritingSourceImageVaultPath(writingFile.path, sourceImageRelative);
				const jpegFile = plugin.app.vault.getAbstractFileByPath(jpegPath);
				if (!(jpegFile instanceof TFile)) {
					if (!cancelled) setSourceImageUrl(null);
					return;
				}
				const resourcePath = plugin.app.vault.getResourcePath(jpegFile);
				if (!cancelled) setSourceImageUrl(resourcePath);
			} catch {
				if (!cancelled) setSourceImageUrl(null);
			}
		};
		void loadSourceImage();
		return () => {
			cancelled = true;
		};
	}, [plugin, writingFile?.path]);

	return sourceImageUrl;
}
