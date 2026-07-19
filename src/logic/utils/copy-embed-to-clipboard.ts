import { Notice } from 'obsidian';

export async function copyEmbedMarkdownToClipboard(embedStr: string): Promise<boolean> {
	if (!embedStr) {
		new Notice('Nothing to copy');
		return false;
	}

	try {
		await navigator.clipboard.writeText(embedStr);
		new Notice('Embed copied to clipboard');
		return true;
	} catch {
		new Notice('Failed to copy embed to clipboard');
		return false;
	}
}
