/**
 * Arrows, stars, boxes, and similar handwritten list marks. Not a leading `-` or `1.`.
 * Flash Lite still copies these after the portal prompt forbids them.
 */
const LIST_FLOURISH_PATTERN =
	/^(?:-{1,3}>|–>|—>|→|➔|➜|➡|⇒|=>|•|●|◦|∙|·|▪|‣|⁃|☆|★|✦|☐|□|■|❑|☑|✓|✔)\s*(.*)$/;

/**
 * Turns one flourish prefix into a `-` bullet. Numbered lines and blank lines stay as written.
 * Does not remove blank lines: a blank line is a real markdown break, and only the model knows
 * whether the handwriting had one.
 */
function rewriteListFlourishLine(line: string): string {
	const indentMatch = /^(\s*)(.*)$/.exec(line);
	if (!indentMatch) return line;
	const indent = indentMatch[1];
	const content = indentMatch[2];
	if (content.trim().length === 0) return line;

	const isNumberedItem = /^\d+[.)]\s+/.test(content);
	if (isNumberedItem) return line;

	const markdownBullet = /^([-*+])\s+(.*)$/.exec(content);
	if (markdownBullet) {
		if (markdownBullet[1] === '-') return line;
		return `${indent}- ${markdownBullet[2]}`;
	}

	const flourish = LIST_FLOURISH_PATTERN.exec(content);
	if (!flourish) return line;
	return `${indent}- ${flourish[1]}`.replace(/\s+$/, '');
}

/** Rewrites flourish glyphs to `-` bullets. Leaves paragraph and list spacing unchanged. */
export function normalizeInkTranscriptMarkdown(markdown: string): string {
	return markdown.replace(/\r\n/g, '\n').split('\n').map(rewriteListFlourishLine).join('\n');
}
