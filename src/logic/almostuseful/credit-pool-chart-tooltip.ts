import tippy, { type Instance, type Props } from 'tippy.js';
import 'tippy.js/dist/tippy.css';

/////////
/////////

const liveTooltipSessions: CreditPoolChartTooltipSession[] = [];

interface CreditPoolChartTooltipSession {
	svg: SVGSVGElement;
	ownerDocument: Document;
	instance: Instance;
	anchor: HTMLElement;
	pointer: { x: number; y: number };
	focusedKey: string | null;
	hideTimeout: number | null;
	isTouchPointer: boolean;
	onPointerMove: (event: PointerEvent) => void;
	onPointerEnter: (event: PointerEvent) => void;
	onPointerDown: (event: PointerEvent) => void;
	onPointerLeave: (event: PointerEvent) => void;
	onDocumentPointerDown: (event: PointerEvent) => void;
}

export interface CreditPoolChartTooltipTarget {
	key: string;
	html: string;
}

/** Formats chart share percentages with a floor label for tiny values. */
export function formatCreditPoolChartPercent(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return '0%';
	if (value < 0.1) return '<0.1%';
	return `${value.toLocaleString('en-AU', {
		maximumFractionDigits: 1,
		minimumFractionDigits: 0,
	})}%`;
}

/** Destroys tippy instances before Settings re-paints charts. */
export function destroyCreditPoolChartTooltips(): void {
	for (const session of liveTooltipSessions) {
		teardownTooltipSession(session);
	}
	liveTooltipSessions.length = 0;
}

export interface BindCreditPoolChartTooltipsProps {
	svg: SVGSVGElement;
	resolveTarget: (element: Element | null) => CreditPoolChartTooltipTarget | null;
}

/**
 * Pointer-following tippy (right, then left) with touch tap-to-dismiss.
 * Hit rects stay tappable at 2px paint; tooltip itself does not steal hover.
 */
export function bindCreditPoolChartTooltips(props: BindCreditPoolChartTooltipsProps): void {
	// Settings (and other leaves) can pop out into another Electron window.
	// Module `document` is the main vault window — mounting tippy there pins the
	// tooltip to that window's origin, far from the chart.
	const ownerDocument = props.svg.ownerDocument;
	const anchor = ownerDocument.createElement('div');
	anchor.setAttribute('aria-hidden', 'true');
	anchor.style.position = 'fixed';
	anchor.style.top = '0';
	anchor.style.left = '0';
	anchor.style.width = '0';
	anchor.style.height = '0';
	anchor.style.pointerEvents = 'none';
	ownerDocument.body.appendChild(anchor);

	const pointer = { x: 0, y: 0 };
	const session: CreditPoolChartTooltipSession = {
		svg: props.svg,
		ownerDocument,
		instance: null as unknown as Instance,
		anchor,
		pointer,
		focusedKey: null,
		hideTimeout: null,
		isTouchPointer: false,
		onPointerMove: () => undefined,
		onPointerEnter: () => undefined,
		onPointerDown: () => undefined,
		onPointerLeave: () => undefined,
		onDocumentPointerDown: () => undefined,
	};

	const instance = tippy(anchor, {
		trigger: 'manual',
		placement: 'right',
		offset: [0, 12],
		interactive: false,
		animation: false,
		allowHTML: true,
		theme: 'ddc_ink_almostuseful-chart',
		appendTo: () => ownerDocument.body,
		getReferenceClientRect: () => virtualPointerRect(pointer.x, pointer.y),
		popperOptions: {
			strategy: 'fixed',
			modifiers: [
				{
					name: 'flip',
					options: {
						fallbackPlacements: ['left', 'top', 'bottom'],
					},
				},
			],
		},
	} as Partial<Props>);
	session.instance = instance;

	const clearHideTimeout = () => {
		if (session.hideTimeout === null) return;
		window.clearTimeout(session.hideTimeout);
		session.hideTimeout = null;
	};

	const hideTooltip = () => {
		clearHideTimeout();
		session.focusedKey = null;
		applyPaintedBarFocus(session.svg, null);
		instance.hide();
	};

	const scheduleHide = () => {
		if (session.isTouchPointer) return;
		clearHideTimeout();
		session.hideTimeout = window.setTimeout(() => {
			hideTooltip();
		}, 80);
	};

	const showForTarget = (target: CreditPoolChartTooltipTarget, clientX: number, clientY: number) => {
		clearHideTimeout();
		pointer.x = clientX;
		pointer.y = clientY;
		// Keep the dummy on the pointer so Popper still has a same-window rect if
		// getReferenceClientRect is skipped on a given Tippy/Popper version.
		anchor.style.left = `${clientX}px`;
		anchor.style.top = `${clientY}px`;
		instance.setProps({
			getReferenceClientRect: () => virtualPointerRect(pointer.x, pointer.y),
		});
		if (session.focusedKey !== target.key) {
			instance.setContent(target.html);
			session.focusedKey = target.key;
			applyPaintedBarFocus(session.svg, target.key);
			instance.show();
		}
		instance.popperInstance?.update();
	};

	const targetFromEvent = (event: PointerEvent): CreditPoolChartTooltipTarget | null => {
		const path = event.composedPath();
		for (const node of path) {
			if (!(node instanceof Element)) continue;
			const target = props.resolveTarget(node);
			if (target) return target;
		}
		return props.resolveTarget(event.target instanceof Element ? event.target : null);
	};

	session.onPointerMove = (event: PointerEvent) => {
		pointer.x = event.clientX;
		pointer.y = event.clientY;
		const isTouch = event.pointerType === 'touch';
		if (isTouch) return;
		const target = targetFromEvent(event);
		if (!target) {
			scheduleHide();
			return;
		}
		showForTarget(target, event.clientX, event.clientY);
	};

	session.onPointerEnter = (event: PointerEvent) => {
		const isTouch = event.pointerType === 'touch';
		if (isTouch) return;
		const target = targetFromEvent(event);
		if (!target) return;
		showForTarget(target, event.clientX, event.clientY);
	};

	session.onPointerDown = (event: PointerEvent) => {
		const isTouch = event.pointerType === 'touch';
		session.isTouchPointer = isTouch;
		const target = targetFromEvent(event);
		if (!target) return;
		if (isTouch && session.focusedKey === target.key) {
			hideTooltip();
			return;
		}
		showForTarget(target, event.clientX, event.clientY);
	};

	session.onPointerLeave = (event: PointerEvent) => {
		if (event.pointerType === 'touch') return;
		scheduleHide();
	};

	session.onDocumentPointerDown = (event: PointerEvent) => {
		if (!session.isTouchPointer) return;
		if (!instance.state.isVisible) return;
		const path = event.composedPath();
		if (path.includes(props.svg)) return;
		hideTooltip();
	};

	props.svg.addEventListener('pointermove', session.onPointerMove);
	props.svg.addEventListener('pointerenter', session.onPointerEnter);
	props.svg.addEventListener('pointerdown', session.onPointerDown);
	props.svg.addEventListener('pointerleave', session.onPointerLeave);
	ownerDocument.addEventListener('pointerdown', session.onDocumentPointerDown, true);

	liveTooltipSessions.push(session);
}

/** Tears down listeners, dummy anchor, and tippy for one chart SVG. */
function teardownTooltipSession(session: CreditPoolChartTooltipSession): void {
	if (session.hideTimeout !== null) {
		window.clearTimeout(session.hideTimeout);
	}
	session.ownerDocument.removeEventListener('pointerdown', session.onDocumentPointerDown, true);
	session.svg.removeEventListener('pointermove', session.onPointerMove);
	session.svg.removeEventListener('pointerenter', session.onPointerEnter);
	session.svg.removeEventListener('pointerdown', session.onPointerDown);
	session.svg.removeEventListener('pointerleave', session.onPointerLeave);
	session.instance.destroy();
	session.anchor.remove();
}

/**
 * Day-column fallback keys end in `:day`; highlight the painted segment they represent.
 * Hit rects sit above paint, so CSS :hover on bars never fires.
 */
function applyPaintedBarFocus(svg: SVGSVGElement, tooltipKey: string | null): void {
	svg.classList.toggle('is-chart-focused', tooltipKey != null);
	const paintKey = tooltipKey ? paintedKeyForTooltip(tooltipKey) : null;
	const painted = svg.querySelectorAll('[data-credit-pool-key]');
	painted.forEach((element) => {
		const isFocused =
			paintKey != null && element.getAttribute('data-credit-pool-key') === paintKey;
		element.classList.toggle('is-focused', isFocused);
	});
}

function paintedKeyForTooltip(tooltipKey: string): string {
	if (tooltipKey.endsWith(':day')) return tooltipKey.slice(0, -4);
	return tooltipKey;
}

/** Zero-size client rect at the pointer so Popper places to the right of the tap/hover. */
function virtualPointerRect(x: number, y: number): DOMRect {
	return {
		width: 0,
		height: 0,
		top: y,
		bottom: y,
		left: x,
		right: x,
		x,
		y,
		toJSON: () => undefined,
	};
}
