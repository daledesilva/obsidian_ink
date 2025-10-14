




export function getFullPageWidth(childEl: HTMLElement | null): number {
	// 首先尝试查找cm-scroller元素（在编辑视图中常见）
	const visiblePageAreaEl = childEl?.closest('.cm-scroller');
	if(visiblePageAreaEl) {
		const maxWidth = (visiblePageAreaEl as HTMLDivElement).getBoundingClientRect().width;
		return maxWidth;
	}
	
	// 如果找不到cm-scroller，尝试查找markdown-preview-view元素（在预览视图中常见）
	const previewViewEl = childEl?.closest('.markdown-preview-view');
	if(previewViewEl) {
		const maxWidth = (previewViewEl as HTMLDivElement).getBoundingClientRect().width;
		return maxWidth;
	}
	
	// 如果都找不到，返回一个更大的默认值而不是500
	// 返回1200作为一个更合理的默认宽度
	return 1200;
}