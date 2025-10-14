import { INK_EMBED_BASE_URL } from "src/constants";
import { DEFAULT_EMBED_SETTINGS } from "src/types/embed-settings";

// V2 builder: Inserts an image embed + settings link that the v2 CM6 extension detects

export const buildDrawingEmbed = (filepath: string): string => {
	// 提取文件名（不含路径）
	const filename = filepath.split('/').pop() || filepath;
	const s = DEFAULT_EMBED_SETTINGS;
	const params = new URLSearchParams({
		version: String(s.version),
		width: String(s.embedDisplay.width),
		aspectRatio: String(s.embedDisplay.aspectRatio),
		viewBoxX: String(s.viewBox.x),
		viewBoxY: String(s.viewBox.y),
		viewBoxWidth: String(s.viewBox.width),
		viewBoxHeight: String(s.viewBox.height),
		type: 'inkDrawing'
	});

	// Leading space before '!' and newline after are important for the CM6 detector
	// 完整格式：包含图片嵌入和编辑链接两部分，以便drawing-embed-extension能够正确识别
	const embedImageLine = ` ![InkDrawing](<${filename}>)`;
	const editLinkLine = ` [Edit Drawing](<${filename}?${params.toString()}>)`;
	return `\n${embedImageLine}\n${editLinkLine}\n`;
};
// V2 builder: Inserts an image embed + settings link that the v2 CM6 writing extension detects

export const buildWritingEmbed = (filepath: string): string => {
	// 提取文件名（不含路径）
	const filename = filepath.split('/').pop() || filepath;
	const s = DEFAULT_EMBED_SETTINGS;
	const params = new URLSearchParams({
		version: String(s.version),
		type: 'inkWriting'
	});

	// Leading space before '!' and newline after are important for the CM6 detector
	// 完整格式：包含图片嵌入和编辑链接两部分，编辑链接不包含文件名只保留参数
	const embedImageLine = ` ![InkWriting](<${filename}>)`;
	const editLinkLine = ` [Edit Writing](<?${params.toString()}>)`;
	return `\n${embedImageLine}\n${editLinkLine}\n`;
};
