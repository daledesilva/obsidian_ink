




export function getFullPageWidth(childEl: HTMLElement | null): number {
	const visiblePageAreaEl = (
		childEl?.closest('.cm-scroller')
		?? childEl?.closest('.markdown-preview-view')
		?? childEl?.closest('.markdown-rendered')
	);
	if (!visiblePageAreaEl) return 500;
	return (visiblePageAreaEl as HTMLDivElement).getBoundingClientRect().width;
}