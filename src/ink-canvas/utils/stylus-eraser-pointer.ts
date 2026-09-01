/** Pointer Events: pen eraser tip / hardware erase uses button 5 and buttons bit 32. */
export const STYLUS_ERASER_POINTER_BUTTON = 5;

/** Bitmask for `buttons` when the stylus eraser is active (W3C Pointer Events). */
export const STYLUS_ERASER_BUTTONS_MASK = 32;

/** Pen barrel / side button (often mapped to erase on AES pens). */
export const STYLUS_SIDE_POINTER_BUTTON = 2;

export function isStylusEraserPointerDown(
	e: Pick<PointerEvent, 'button'>,
): boolean {
	return e.button === STYLUS_ERASER_POINTER_BUTTON;
}

export function isStylusEraserPointerActive(
	e: Pick<PointerEvent, 'buttons'>,
): boolean {
	return (e.buttons & STYLUS_ERASER_BUTTONS_MASK) !== 0;
}

/** Barrel button on a pen (`pointerType: 'pen'`, button 2). */
export function isStylusSideButtonPointerDown(
	e: Pick<PointerEvent, 'button' | 'pointerType'>,
): boolean {
	return e.pointerType === 'pen' && e.button === STYLUS_SIDE_POINTER_BUTTON;
}
