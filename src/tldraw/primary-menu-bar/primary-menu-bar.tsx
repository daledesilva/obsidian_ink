import './primary-menu-bar.scss';
import * as React from 'react';

///////////
///////////

interface PrimaryMenuBarProps {
    children: React.ReactNode,
}

export const PrimaryMenuBar = (props: PrimaryMenuBarProps) => {
    const scrollContainerElRef = React.useRef<HTMLDivElement>(null);
	const primaryMenuBarElRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        initScrollHandler();

        // When unmounting
        return () => {
            cleanUpScrollHandler();
        }
    })

    ///////////

    return <>
        <div
            ref = {primaryMenuBarElRef}
            className = 'ink_write_primary-menu-bar'
        >
            {props.children}
        </div>
    </>;

    ///////////

    function initScrollHandler() {
        const primaryMenuBar = primaryMenuBarElRef.current;
        const scrollEl = primaryMenuBar?.closest(".cm-scroller");
        if(!scrollEl) return;
        scrollEl.addEventListener('scroll', handleScrolling);
        // dispatch event immediately incase it's already partially scrolled off screen
        scrollEl.dispatchEvent(new CustomEvent('scroll'));
    }
    function cleanUpScrollHandler() {
        const scrollEl = scrollContainerElRef.current;
        scrollEl?.removeEventListener('scroll', handleScrolling);
    }

    function handleScrolling(e: Event): void {
        const scrollEl = e.target as HTMLDivElement;
        const pageScrollY = scrollEl.scrollTop;

        const primaryMenuBar = primaryMenuBarElRef.current;
        const containerEl = primaryMenuBar?.parentElement;
        if (!primaryMenuBar) return;
        if (!containerEl) return;

        let containerPosY = containerEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top || 0;

        // Because the menu bar is translated outside of the container by it's height
        // So considering the container position that much lower means it will stay visible without changing the translation
        const menuBarHeight = primaryMenuBar.getBoundingClientRect().height;
        const containerHeight = containerEl.getBoundingClientRect().height;
        containerPosY -= Number(menuBarHeight);

        const containerOffsetY = containerPosY;// - pageScrollY;

        const scrolledOffTopEdge = containerOffsetY < 0;
        const scrolledOffBottomEdge = containerOffsetY+containerHeight < 0;
        
        if (scrolledOffBottomEdge) {
            const top = containerHeight + 'px';
            primaryMenuBar.style.top = top;

        } else if (scrolledOffTopEdge) {
            const top = Math.abs(containerOffsetY) + 'px';
            primaryMenuBar.style.top = top;

        } else {
            primaryMenuBar.style.removeProperty('top');
        }
    }
}