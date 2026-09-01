import {
	isStylusEraserPointerActive,
	isStylusEraserPointerDown,
	isStylusSideButtonPointerDown,
	STYLUS_ERASER_BUTTONS_MASK,
	STYLUS_ERASER_POINTER_BUTTON,
} from 'src/ink-canvas/utils/stylus-eraser-pointer';

describe('stylus-eraser-pointer', () => {
	it('detects eraser pointerdown via button 5', () => {
		expect(isStylusEraserPointerDown({ button: STYLUS_ERASER_POINTER_BUTTON })).toBe(true);
		expect(isStylusEraserPointerDown({ button: 0 })).toBe(false);
	});

	it('detects active eraser via buttons mask 32', () => {
		expect(isStylusEraserPointerActive({ buttons: STYLUS_ERASER_BUTTONS_MASK })).toBe(true);
		expect(isStylusEraserPointerActive({ buttons: STYLUS_ERASER_BUTTONS_MASK | 1 })).toBe(true);
		expect(isStylusEraserPointerActive({ buttons: 1 })).toBe(false);
	});

	it('detects pen side button pointerdown', () => {
		expect(isStylusSideButtonPointerDown({ button: 2, pointerType: 'pen' })).toBe(true);
		expect(isStylusSideButtonPointerDown({ button: 2, pointerType: 'mouse' })).toBe(false);
		expect(isStylusSideButtonPointerDown({ button: 0, pointerType: 'pen' })).toBe(false);
	});
});
