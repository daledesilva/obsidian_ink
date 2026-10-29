import classNames from 'classnames';
import './primary-menu-bar.scss';
import * as React from 'react';
import { computePrimaryMenuBarTop } from 'src/logic/utils/menu-bar-scroll-position';

///////////
///////////

export interface PrimaryMenuBarProps {
    children: React.ReactNode,
}

/** Sticky top menu bar for the ink editors; keeps itself clear of the note scroller. */
export const PrimaryMenuBar = (props: PrimaryMenuBarProps) => {
	const primaryMenuBarElRef = React.useRef<HTMLDivElement>(null);
    const [menuActive] = React.useState<boolean>(true);

    React.useEffect(() => {
        // Track the element we actually subscribed to. The previous version stored the scroller in a
        // different ref that was never assigned, so the listener was never removed, and the effect
        // had no dependency list, so every render added another one — stale handlers then fought
        // over `top` and could park the menu inside the canvas (#124).
        let scrollEl: HTMLElement | null = null;

        function initScrollHandler() {
            const primaryMenuBar = primaryMenuBarElRef.current;
            scrollEl = primaryMenuBar?.closest<HTMLElement>('.cm-scroller') ?? null;
            if (!scrollEl) return;
            scrollEl.addEventListener('scroll', handleScrolling);
            // Dispatch immediately in case the embed is already partially scrolled off screen.
            scrollEl.dispatchEvent(new CustomEvent('scroll'));
        }

        function cleanUpScrollHandler() {
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

    function handleScrolling(e: Event): void {
        const scrollAreaEl = e.target as HTMLDivElement;

        const primaryMenuBar = primaryMenuBarElRef.current;
        const embedEl = primaryMenuBar?.parentElement;
        if (!primaryMenuBar) return;
        if (!embedEl) return;

        const scrollAreaRect = scrollAreaEl.getBoundingClientRect();
        const embedRect = embedEl.getBoundingClientRect();
        const menuBarRect = primaryMenuBar.getBoundingClientRect();

        const topOffsetPx = computePrimaryMenuBarTop(
            {
                menuBarHeightPx: menuBarRect.height,
                embedHeightPx: embedRect.height,
                embedOffsetTopPx: embedRect.top - scrollAreaRect.top,
                scrollAreaHeightPx: scrollAreaRect.height,
            },
            menuActive,
        );

        if (topOffsetPx === null) {
            primaryMenuBar.style.removeProperty('top');
            return;
        }
        primaryMenuBar.style.top = `${topOffsetPx}px`;
    }
}
