import classNames from 'classnames';
import './secondary-menu-bar.scss';
import * as React from 'react';
import { computeSecondaryMenuBarBottom } from 'src/logic/utils/menu-bar-scroll-position';

///////////
///////////

export interface SecondaryMenuBarProps {
    children: React.ReactNode,
}

/** Bottom menu bar for the ink editors; keeps itself pinned while the note scroller moves. */
export const SecondaryMenuBar = (props: SecondaryMenuBarProps) => {
	const SecondaryMenuBarElRef = React.useRef<HTMLDivElement>(null);
    const [menuActive] = React.useState<boolean>(true);

    React.useEffect(() => {
        // Same leak as the primary bar: the old cleanup read a ref that was never assigned and the
        // effect had no dependency list, so handlers accumulated on every render (#124).
        let scrollEl: HTMLElement | null = null;
        let initialScrollTimer = 0;

        function initScrollHandler() {
            const SecondaryMenuBar = SecondaryMenuBarElRef.current;
            scrollEl = SecondaryMenuBar?.closest<HTMLElement>('.cm-scroller') ?? null;
            if (!scrollEl) return;
            scrollEl.addEventListener('scroll', handleScrolling);
            // Dispatch after a short delay in case the embed is already partially scrolled off screen.
            initialScrollTimer = window.setTimeout(() => {
                scrollEl?.dispatchEvent(new CustomEvent('scroll'));
            }, 500);
        }

        function cleanUpScrollHandler() {
            if (initialScrollTimer) window.clearTimeout(initialScrollTimer);
            scrollEl?.removeEventListener('scroll', handleScrolling);
            scrollEl = null;
        }

        initScrollHandler();

        return () => {
            cleanUpScrollHandler();
        }
    }, []);

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

    function handleScrolling(e: Event): void {
        const scrollAreaEl = e.target as HTMLDivElement;
        
        const SecondaryMenuBar = SecondaryMenuBarElRef.current;
        const embedEl = SecondaryMenuBar?.parentElement;
        if (!SecondaryMenuBar) return;
        if (!embedEl) return;

        const scrollAreaRect = scrollAreaEl.getBoundingClientRect();
        const embedRect = embedEl.getBoundingClientRect();
        const menuBarRect = SecondaryMenuBar.getBoundingClientRect();

        const bottomOffsetPx = computeSecondaryMenuBarBottom(
            {
                menuBarHeightPx: menuBarRect.height,
                embedHeightPx: embedRect.height,
                embedOffsetTopPx: embedRect.top - scrollAreaRect.top,
                scrollAreaHeightPx: scrollAreaRect.height,
            },
            menuActive,
        );

        if (bottomOffsetPx === null) {
            SecondaryMenuBar.style.removeProperty('bottom');
            return;
        }
        SecondaryMenuBar.style.bottom = `${bottomOffsetPx}px`;
    }
}
