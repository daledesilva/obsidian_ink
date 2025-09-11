/**
 * Ensure the widget root element cannot receive focus.
 * This prevents the on-screen keyboard reappearing when a pen is lifted on touch devices.
 */
export function preventWidgetRootStealingFocus(element: HTMLElement): void {
    element.tabIndex = -1;
}


