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
            ref = {primaryMenuBarElRef}
            className = {classNames([
                'ink_primary-menu-bar',
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

    // function initFocusHandlers() {
    //     const parentEmbedEl = primaryMenuBarElRef.current?.closest('.ddc_ink_embed');
    //     if(!parentEmbedEl) return;
    //     parentEmbedEl.addEventListener('focusin', handleFocusIn)
    //     parentEmbedEl.addEventListener('focusout', handleFocusOut)
    // }
    // function cleanUpFocusHandlers() {
    //     const parentEmbedEl = primaryMenuBarElRef.current?.closest('.ddc_ink_embed');
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
        const scrollAreaEl = e.target as HTMLDivElement;
        const pageScrollY = scrollAreaEl.scrollTop;

        const primaryMenuBar = primaryMenuBarElRef.current;
        const embedEl = primaryMenuBar?.parentElement;
        if (!primaryMenuBar) return;
        if (!embedEl) return;

        const menuBarHeight = primaryMenuBar.getBoundingClientRect().height;
        const embedHeight = embedEl.getBoundingClientRect().height;

        let embedPosY = embedEl.getBoundingClientRect().top - scrollAreaEl.getBoundingClientRect().top || 0;
        if(menuActive) {
            // When the menu bar is translated outside of the container, correct for that by moving it down
            embedPosY -= Number(menuBarHeight);
        }

        const embedOffsetY = embedPosY;// - pageScrollY;

        const embedTopScrolledOffTop = embedOffsetY < 0;
        const embedBottomScrolledOffTop = embedOffsetY+embedHeight < 0;
        
        if (embedBottomScrolledOffTop) {
            // So the menu isn't sticky past the bottom edge of the embed.
            // And this takes priority.
            const top = embedHeight + 'px';
            primaryMenuBar.style.top = top;

        } else if (embedTopScrolledOffTop) {
            // So the menu is sticky when the top edge is off screen
            const top = (embedOffsetY * -1) + 'px';
            primaryMenuBar.style.top = top;

        } else {
            primaryMenuBar.style.removeProperty('top');
        }
    }
}