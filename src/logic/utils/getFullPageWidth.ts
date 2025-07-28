




export function getFullPageWidth(childEl: HTMLElement | null): number {
	const visiblePageAreaEl = childEl?.closest('.cm-scroller');
	if(!visiblePageAreaEl) return 500; // Average number for edge cases where the childEl might not be defined yet
	const maxWidth = (visiblePageAreaEl as HTMLDivElement).getBoundingClientRect().width;
	return maxWidth;
}