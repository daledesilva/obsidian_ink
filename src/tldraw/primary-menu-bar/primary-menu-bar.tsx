import classNames from 'classnames';
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
    const [menuActive, setMenuActive] = React.useState<boolean>(true);

    React.useEffect(() => {
        console.log('MOUNTING PRIMARY MENU BAR');
        initScrollHandler();
        initFocusHandlers();
        
        // When unmounting
        return () => {
            cleanUpScrollHandler();
            cleanUpFocusHandlers();
        }
    })

    ///////////

    return <>
        <div
            ref = {primaryMenuBarElRef}
            className = {classNames([
                'ink_write_primary-menu-bar',
                menuActive && 'ddc_ink_active',
            ])}
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

    function initFocusHandlers() {
        const parentEmbedEl = primaryMenuBarElRef.current?.closest('.ddc_ink_embed');
        if(!parentEmbedEl) return;
        parentEmbedEl.addEventListener('focusin', handleFocusIn)
        parentEmbedEl.addEventListener('focusout', handleFocusOut)
    }
    function cleanUpFocusHandlers() {
        const parentEmbedEl = primaryMenuBarElRef.current?.closest('.ddc_ink_embed');
        if(!parentEmbedEl) return;
        parentEmbedEl.removeEventListener('focusin', handleFocusIn)
        parentEmbedEl.removeEventListener('focusout', handleFocusOut)
    }

    function handleFocusIn(e: Event): void {
        console.log('focusin from menu');
        setMenuActive(true);
    }
    function handleFocusOut(e: Event): void {
        console.log('focusout from menu');
        setMenuActive(false);
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