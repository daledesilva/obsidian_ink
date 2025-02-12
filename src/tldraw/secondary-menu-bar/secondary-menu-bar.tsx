import classNames from 'classnames';
import './secondary-menu-bar.scss';
import * as React from 'react';

///////////
///////////

interface SecondaryMenuBarProps {
    children: React.ReactNode,
}

export const SecondaryMenuBar = (props: SecondaryMenuBarProps) => {
    const scrollContainerElRef = React.useRef<HTMLDivElement>(null);
	const SecondaryMenuBarElRef = React.useRef<HTMLDivElement>(null);
    const [menuActive, setMenuActive] = React.useState<boolean>(true);

    React.useEffect(() => {
        initScrollHandler();
        // initFocusHandlers();
        
        // When unmounting
        return () => {
            cleanUpScrollHandler();
            // cleanUpFocusHandlers();
        }
    })

    ///////////

    return <>
        <div
            ref = {SecondaryMenuBarElRef}
            className = {classNames([
                'ink_secondary-menu-bar',
                menuActive && 'ddc_ink_active',
            ])}
        >
            {props.children}
        </div>
    </>;

    ///////////

    function initScrollHandler() {
        const SecondaryMenuBar = SecondaryMenuBarElRef.current;
        const scrollEl = SecondaryMenuBar?.closest(".cm-scroller");
        if(!scrollEl) return;
        scrollEl.addEventListener('scroll', handleScrolling);
        // dispatch event immediately incase it's already partially scrolled off screen
        scrollEl.dispatchEvent(new CustomEvent('scroll'));
    }
    function cleanUpScrollHandler() {
        const scrollEl = scrollContainerElRef.current;
        scrollEl?.removeEventListener('scroll', handleScrolling);
    }

    // function initFocusHandlers() {
    //     const parentEmbedEl = SecondaryMenuBarElRef.current?.closest('.ddc_ink_embed');
    //     if(!parentEmbedEl) return;
    //     parentEmbedEl.addEventListener('focusin', handleFocusIn)
    //     parentEmbedEl.addEventListener('focusout', handleFocusOut)
    // }
    // function cleanUpFocusHandlers() {
    //     const parentEmbedEl = SecondaryMenuBarElRef.current?.closest('.ddc_ink_embed');
    //     if(!parentEmbedEl) return;
    //     parentEmbedEl.removeEventListener('focusin', handleFocusIn)
    //     parentEmbedEl.removeEventListener('focusout', handleFocusOut)
    // }

    // function handleFocusIn(e: Event): void {
    //     setMenuActive(true);
    // }
    // function handleFocusOut(e: Event): void {
    //     setMenuActive(false);
    // }

    function handleScrolling(e: Event): void {
        const scrollEl = e.target as HTMLDivElement;
        const pageScrollY = scrollEl.scrollTop;

        const SecondaryMenuBar = SecondaryMenuBarElRef.current;
        const containerEl = SecondaryMenuBar?.parentElement;
        if (!SecondaryMenuBar) return;
        if (!containerEl) return;

        const menuBarHeight = SecondaryMenuBar.getBoundingClientRect().height;
        const containerHeight = containerEl.getBoundingClientRect().height;

        let containerPosY = containerEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top || 0;
        if(menuActive) {
            // When the menu bar is translated outside of the container, correct for that by moving it down
            containerPosY -= Number(menuBarHeight);
        }

        const containerOffsetY = containerPosY;// - pageScrollY;

        const scrolledOffTopEdge = containerOffsetY < 0;
        const scrolledOffBottomEdge = containerOffsetY+containerHeight < 0;
        
        if (scrolledOffBottomEdge) {
            const top = containerHeight + 'px';
            SecondaryMenuBar.style.top = top;

        } else if (scrolledOffTopEdge) {
            const top = Math.abs(containerOffsetY) + 'px';
            SecondaryMenuBar.style.top = top;

        } else {
            SecondaryMenuBar.style.removeProperty('top');
        }
    }
}