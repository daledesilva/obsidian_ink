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
        // dispatch event immediately (with slight delay)incase it's already partially scrolled off screen
        setTimeout(() => {
            scrollEl.dispatchEvent(new CustomEvent('scroll'));
        }, 500);
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
        const scrollAreaEl = e.target as HTMLDivElement;

        const pageScrollY = scrollAreaEl.scrollTop;

        const SecondaryMenuBar = SecondaryMenuBarElRef.current;
        const embedEl = SecondaryMenuBar?.parentElement;
        if (!SecondaryMenuBar) return;
        if (!embedEl) return;

        const scrollAreaHeight = scrollAreaEl.getBoundingClientRect().height;
        const menuBarHeight = SecondaryMenuBar.getBoundingClientRect().height;
        const embedHeight = embedEl.getBoundingClientRect().height;

        let embedPosY = embedEl.getBoundingClientRect().top - scrollAreaEl.getBoundingClientRect().top || 0;
        if(menuActive) {
            // When the menu bar is translated outside of the container, correct for that
            embedPosY += Number(menuBarHeight);
        }

        const embedOffsetY = embedPosY;

        // the addition of menuBarHeight/2 is because it's only shifted 50% in css (Same with line further down)
        const embedBottomScrolledOffScrollAreaBottom = embedOffsetY+embedHeight - menuBarHeight/2 > scrollAreaHeight;
        const embedTopScrolledOffScrollAreaBottom = embedOffsetY > scrollAreaHeight;

        // Check if we're inside an embed block (desktop) or standalone (mobile)
        const isEmbedded = SecondaryMenuBar.closest('.cm-embed-block') !== null;
        const defaultBottom = isEmbedded ? 40 : 15; // px

        if (embedTopScrolledOffScrollAreaBottom) {
            // So the menu isn't sticky past the bottom edge of the embed.
            // And this takes priority.
            const bottom = embedHeight + 'px';
            SecondaryMenuBar.style.bottom = bottom;

        } else if (embedBottomScrolledOffScrollAreaBottom) {
            // So the menu is sticky when the bottom edge is off screen
            // const bottom = (embedOffsetY+(embedHeight)-scrollAreaHeight) + 'px'; // embedHeight is divided by two because it's only shift 50% in css
            const bottom = (embedOffsetY+defaultBottom+embedHeight-scrollAreaHeight - menuBarHeight/2) + 'px';
            SecondaryMenuBar.style.bottom = bottom;

        } else {
            SecondaryMenuBar.style.bottom = defaultBottom + 'px';
        }
    }
}
