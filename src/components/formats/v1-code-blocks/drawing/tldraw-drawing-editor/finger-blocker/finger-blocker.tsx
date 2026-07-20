import * as React from 'react';
import type { Editor, TLPointerEventInfo } from '@tldraw/tldraw';

import './finger-blocker.scss';

const INK_CM_SCROLLER_SCROLL_PINNED_CLASS = 'ink-cm-scroller--scroll-pinned';
const INK_FINGER_BLOCKER_TOUCH_NONE_CLASS = 'ink-finger-blocker--touch-none';
const INK_FINGER_BLOCKER_TOUCH_PAN_XY_CLASS = 'ink-finger-blocker--touch-pan-xy';

function setFingerBlockerTouchMode(blockerElement: HTMLElement, mode: 'none' | 'pan-xy' | 'default') {
	blockerElement.classList.remove(INK_FINGER_BLOCKER_TOUCH_NONE_CLASS, INK_FINGER_BLOCKER_TOUCH_PAN_XY_CLASS);
	if (mode === 'none') blockerElement.classList.add(INK_FINGER_BLOCKER_TOUCH_NONE_CLASS);
	else if (mode === 'pan-xy') blockerElement.classList.add(INK_FINGER_BLOCKER_TOUCH_PAN_XY_CLASS);
}

// Constants
const POLL_INTERVAL_MS = 100;
const MAX_POLL_RETRIES = 200; // Maximum ~20 seconds (200 * 100ms)

// Type for a tool that has pointer handlers we can wrap
interface ToolWithPointerHandlers {
	onPointerDown?: ((e: TLPointerEventInfo) => void) | undefined;
	onPointerUp?: ((e: TLPointerEventInfo) => void) | undefined;
	onPointerMove?: ((e: TLPointerEventInfo) => void) | undefined;
}

type FingerBlockerProps = {
	getTlEditor: () => Editor | undefined;
	wrapperRef?: React.RefObject<HTMLDivElement>;
	/**
	 * When true, FingerBlocker will detect two-finger touch gestures and forward them to
	 * tldraw's canvas as synthetic pointer events, unlocking the camera for the duration.
	 * Use in embedded drawing editors where the camera is normally locked.
	 */
	enableTwoFingerGestures?: boolean;
	/**
	 * When set (dedicated writing view), single- and two-finger vertical touch pans invoke
	 * this callback instead of native .cm-scroller scroll or pinch-zoom.
	 */
	onVerticalTouchPan?: (deltaY: number) => void;
};

export function FingerBlocker({ getTlEditor, wrapperRef, enableTwoFingerGestures, onVerticalTouchPan }: FingerBlockerProps) {
	const blockerRef = React.useRef<HTMLDivElement>(null);
	const pointerDownRef = React.useRef<boolean>(false);
	const recentPenInputRef = React.useRef<boolean>(false);

	// Refs for scroll pinning strategy
	const isPenDownRef = React.useRef<boolean>(false);
	const lockedScrollPosRef = React.useRef<{ x: number; y: number } | null>(null);
	const activeScrollerRef = React.useRef<HTMLElement | null>(null);

	// Refs for tracking tldraw tool handlers
	const currentTldrawToolIdRef = React.useRef<string | null>(null);
	const tldrawToolCleanupMap = React.useRef<Map<string, () => void>>(new Map());

	// Refs for two-finger gesture mode (only active when enableTwoFingerGestures is true)
	const activeTouchPointerDataRef = React.useRef<Map<number, {
		pointerId: number;
		clientX: number;
		clientY: number;
		screenX: number;
		screenY: number;
		width: number;
		height: number;
		pressure: number;
	}>>(new Map());
	const twoFingerModeActiveRef = React.useRef(false);
	const prevTwoFingerMidpointRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
	const prevTwoFingerDistanceRef = React.useRef<number>(0);
	// Captures the camera's isLocked state before a two-finger gesture unlocks it, so it
	// can be restored when the gesture ends (preserves free camera in dedicated views).
	const prevCameraLockedRef = React.useRef(false);

	// Dedicated writing view: vertical touch pan (single- or two-finger), distinct from pinch-zoom.
	const twoFingerVerticalPanActiveRef = React.useRef(false);
	const prevVerticalPanMidpointRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
	const onVerticalTouchPanRef = React.useRef(onVerticalTouchPan);
	React.useEffect(() => {
		onVerticalTouchPanRef.current = onVerticalTouchPan;
	}, [onVerticalTouchPan]);

	// Helper functions
	const getWrapper = (): HTMLDivElement | null => {
		return (
			wrapperRef?.current ||
			(blockerRef.current?.parentElement as HTMLDivElement | null) ||
			null
		);
	};

	const getCanvas = (): HTMLElement | null => {
		const wrapper = getWrapper();
		return wrapper ? (wrapper.querySelector('.tl-canvas')) : null;
	};

	const getScroller = (): HTMLElement | null => {
		const wrapper = getWrapper();
		return wrapper ? (wrapper.closest('.cm-scroller')) : null;
	};

	const lockScroll = () => {
		const scroller = getScroller();
		if (scroller) {
			// Ref-based state tracking for scroll restoration
			activeScrollerRef.current = scroller;
			lockedScrollPosRef.current = { x: scroller.scrollLeft, y: scroller.scrollTop };
			scroller.classList.add(INK_CM_SCROLLER_SCROLL_PINNED_CLASS);
		}
	};

	const unlockScroll = () => {
		if (isPenDownRef.current) {
			isPenDownRef.current = false;
			if (activeScrollerRef.current) {
				// Functional scroll-lock teardown (not theme styling); kept inline to avoid flash on unpin.
				// Delayed scrollbar restore in code to prevent flashing.
				activeScrollerRef.current.style.overflow = 'auto';
				window.setTimeout(() => {
					if (activeScrollerRef.current) {
						activeScrollerRef.current.style.scrollbarColor = 'auto';
					}
				}, 200);

				// Clear refs
				activeScrollerRef.current = null;
			}
			lockedScrollPosRef.current = null;
		} else {
			// Fallback: if not locked via refs, still handle visual styling
			const scroller = getScroller();
			if (scroller) {
				// Functional scroll-lock teardown (not theme styling); delayed scrollbar to prevent flashing.
				scroller.style.overflow = 'auto';
				window.setTimeout(() => {
					scroller.style.scrollbarColor = 'auto';
				}, 200);
			}
		}
	};

	const closeKeyboard = () => {
		const active = activeDocument.activeElement as HTMLElement | null;
		if (active && !active.classList.contains('tl-canvas')) {
			active.blur();
		}
	};

	// Setup native event listeners to aggressively prevent default behavior for pen/mouse
	React.useEffect(() => {
		const element = blockerRef.current;
		if (!element) return;

		const handlePointerDown = (e: PointerEvent) => {
			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				// Let browser back/forward mouse buttons (3 & 4) pass through so
				// Obsidian's history navigation is not intercepted.
				if (e.pointerType === 'mouse' && (e.button === 3 || e.button === 4)) return;

				// Only lock scroll for left-click (button 0) and pen input.
				// Middle (button 1) and right (button 2) mouse events are used exclusively
				// by embed pan/zoom gestures in tldraw-drawing-editor, which call
				// tlContainer.setPointerCapture() — transferring native capture away from
				// this element. Because setPointerCapture() on a synthetic forwarded event
				// doesn't reliably fire lostpointercapture on this element in Electron/Chromium,
				// the simplest safe approach is to never lock scroll for non-primary buttons.
				const isDrawingInput = e.pointerType === 'pen' || e.button === 0;
				if (isDrawingInput) {
					lockScroll();
					isPenDownRef.current = true;
				}

				// Dynamically prevent touch gestures for Pen (keep this as backup)
				setFingerBlockerTouchMode(element, 'none');

				// Aggressively stop browser handling (scrolling/selection)
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();

				const target = e.target as HTMLElement;
				try {
					target.setPointerCapture(e.pointerId);
				} catch {
					// Ignore if capture fails
				}

				const canvas = getCanvas();
				if (canvas) {
					const forwarded = new PointerEvent('pointerdown', {
						pointerId: e.pointerId,
						pointerType: e.pointerType,
						clientX: e.clientX,
						clientY: e.clientY,
						bubbles: true,
						cancelable: true,
						view: window,
						detail: e.detail,
						screenX: e.screenX,
						screenY: e.screenY,
						ctrlKey: e.ctrlKey,
						shiftKey: e.shiftKey,
						altKey: e.altKey,
						metaKey: e.metaKey,
						button: e.button,
						buttons: e.buttons,
					});
					canvas.dispatchEvent(forwarded);
					recentPenInputRef.current = true;
				}
			} else if (e.pointerType === 'touch') {
				// Track this touch pointer's coordinates for potential two-finger forwarding
				activeTouchPointerDataRef.current.set(e.pointerId, {
					pointerId: e.pointerId,
					clientX: e.clientX,
					clientY: e.clientY,
					screenX: e.screenX,
					screenY: e.screenY,
					width: e.width,
					height: e.height,
					pressure: e.pressure,
				});
				const touchCount = activeTouchPointerDataRef.current.size;
				const verticalTouchPan = onVerticalTouchPanRef.current;

				if (verticalTouchPan) {
					// preventDefault alone is not enough — Obsidian command-palette swipe still fires.
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					setFingerBlockerTouchMode(element, 'none');

					if (touchCount >= 2 && !twoFingerVerticalPanActiveRef.current) {
						twoFingerVerticalPanActiveRef.current = true;
						const [pa, pb] = [...activeTouchPointerDataRef.current.values()];
						prevVerticalPanMidpointRef.current = {
							x: (pa.clientX + pb.clientX) / 2,
							y: (pa.clientY + pb.clientY) / 2,
						};
					}
				} else if (touchCount >= 2 && enableTwoFingerGestures && !twoFingerModeActiveRef.current) {
					// Switch from single-finger scroll mode to two-finger gesture mode.
					// Prevent the browser from handling this as a scroll or system gesture.
					e.preventDefault();
					e.stopPropagation();
					setFingerBlockerTouchMode(element, 'none');
					twoFingerModeActiveRef.current = true;

					// Capture the camera's current lock state so it can be restored when
					// the gesture ends — preserves free camera in dedicated views.
					const editorForLock = getTlEditor();
					prevCameraLockedRef.current = editorForLock ? editorForLock.getCameraOptions().isLocked : false;
					// Unlock the camera for the duration of the gesture.
					// Camera lock state is restored in handleTouchEnd when fingers drop below 2.
					editorForLock?.setCameraOptions({ isLocked: false });

					// Seed prev-state refs so the first pointermove frame has a valid baseline.
					// We do NOT apply any camera update here — the gesture hasn't moved yet.
					const editor = getTlEditor();
					if (editor) {
						const [pa, pb] = [...activeTouchPointerDataRef.current.values()];
						const containerRect = editor.getContainer().getBoundingClientRect();
						prevTwoFingerMidpointRef.current = {
							x: (pa.clientX + pb.clientX) / 2 - containerRect.left,
							y: (pa.clientY + pb.clientY) / 2 - containerRect.top,
						};
						prevTwoFingerDistanceRef.current = Math.hypot(pb.clientX - pa.clientX, pb.clientY - pa.clientY);
					}
				} else if (!twoFingerModeActiveRef.current) {
					// Single finger: let the browser handle scrolling
					setFingerBlockerTouchMode(element, 'pan-xy');
				}
			}
		};

		const handlePointerMove = (e: PointerEvent) => {
			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();

				// Re-assert scroll lock if needed.
				// ie. If it was the first pen stroke since a touch, it was locked too late, so do it again.
				if (isPenDownRef.current && activeScrollerRef.current && lockedScrollPosRef.current) {
					const scroller = activeScrollerRef.current;
					if (Math.abs(scroller.scrollTop - lockedScrollPosRef.current.y) > 1 || 
						Math.abs(scroller.scrollLeft - lockedScrollPosRef.current.x) > 1) {
						scroller.scrollTo(lockedScrollPosRef.current.x, lockedScrollPosRef.current.y);
					}
				}
			} else if (e.pointerType === 'touch' && twoFingerVerticalPanActiveRef.current) {
				const existing = activeTouchPointerDataRef.current.get(e.pointerId);
				if (!existing) return;
				activeTouchPointerDataRef.current.set(e.pointerId, {
					...existing,
					clientX: e.clientX,
					clientY: e.clientY,
					screenX: e.screenX,
					screenY: e.screenY,
				});

				if (activeTouchPointerDataRef.current.size < 2) return;

				const [p0, p1] = [...activeTouchPointerDataRef.current.values()];
				const currentMidpoint = {
					x: (p0.clientX + p1.clientX) / 2,
					y: (p0.clientY + p1.clientY) / 2,
				};
				const prevMidpoint = prevVerticalPanMidpointRef.current;
				const deltaX = currentMidpoint.x - prevMidpoint.x;
				const deltaY = currentMidpoint.y - prevMidpoint.y;

				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();

				if (Math.abs(deltaY) >= Math.abs(deltaX)) {
					// Negate so finger-up scrolls down (matches embed .cm-scroller semantics, not wheel sign).
					onVerticalTouchPanRef.current?.(-deltaY);
				}
				prevVerticalPanMidpointRef.current = currentMidpoint;
			} else if (e.pointerType === 'touch' && onVerticalTouchPanRef.current && !twoFingerVerticalPanActiveRef.current) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				recentPenInputRef.current = false;
				if (e.movementY !== 0) {
					// Negate so finger-up scrolls down (matches embed .cm-scroller semantics, not wheel sign).
					onVerticalTouchPanRef.current(-e.movementY);
				}
			} else if (e.pointerType === 'touch' && recentPenInputRef.current) {
				// Embed: first finger touch after pen — scroll was unlocked too late, so scroll manually.
				const scroller = getScroller();
				if (scroller) {
					scroller.scrollTo({
						top: scroller.scrollTop - e.movementY,
						left: scroller.scrollLeft - e.movementX,
					});
				}
			} else if (e.pointerType === 'touch' && twoFingerModeActiveRef.current) {
				// Update this pointer's stored position so we always use the latest coordinates.
				const existing = activeTouchPointerDataRef.current.get(e.pointerId);
				if (!existing) return;
				activeTouchPointerDataRef.current.set(e.pointerId, {
					...existing,
					clientX: e.clientX,
					clientY: e.clientY,
					screenX: e.screenX,
					screenY: e.screenY,
				});

				if (activeTouchPointerDataRef.current.size < 2) return;

				const editor = getTlEditor();
				if (!editor) return;

				const [p0, p1] = [...activeTouchPointerDataRef.current.values()];
				const containerRect = editor.getContainer().getBoundingClientRect();

				// Current midpoint in container-relative coords
				const cm = {
					x: (p0.clientX + p1.clientX) / 2 - containerRect.left,
					y: (p0.clientY + p1.clientY) / 2 - containerRect.top,
				};
				const curDist = Math.hypot(p1.clientX - p0.clientX, p1.clientY - p0.clientY);

				const pm = prevTwoFingerMidpointRef.current;
				const prevDist = prevTwoFingerDistanceRef.current;

				// Compute new zoom from pinch ratio
				const { x: cx, y: cy, z: cz } = editor.getCamera();
				const { zoomSteps } = editor.getCameraOptions();
				const factor = prevDist > 0 ? curDist / prevDist : 1;
				const newZ = Math.max(zoomSteps[0], Math.min(zoomSteps[zoomSteps.length - 1], cz * factor));

				// Combined pan + zoom: the page point under pm must appear under cm at newZ.
				// tldraw transform: screenX = (pageX + cx) * cz  →  pageX = screenX/cz - cx
				// pageUnderPm = pm.x/cz - cx  →  set equal to pageUnderCm = cm.x/newZ - newCx
				// Solving: newCx = cx + cm.x/newZ - pm.x/cz
				const newCx = cx + cm.x / newZ - pm.x / cz;
				const newCy = cy + cm.y / newZ - pm.y / cz;

				editor.setCamera({ x: newCx, y: newCy, z: newZ }, { animation: { duration: 0 } });

				// Update prev-state for next frame
				prevTwoFingerMidpointRef.current = cm;
				prevTwoFingerDistanceRef.current = curDist;
			}
		};

		const handlePointerUp = (e: PointerEvent) => {
			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				setFingerBlockerTouchMode(element, 'default');
				unlockScroll();
				
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				
				const target = e.target as HTMLElement;
				if (target.hasPointerCapture(e.pointerId)) {
					try {
						target.releasePointerCapture(e.pointerId);
					} catch {
						// Ignore
					}
				}
			} else if (e.pointerType === 'touch') {
				activeTouchPointerDataRef.current.delete(e.pointerId);
				recentPenInputRef.current = false;

				if (onVerticalTouchPanRef.current) {
					if (twoFingerVerticalPanActiveRef.current && activeTouchPointerDataRef.current.size < 2) {
						twoFingerVerticalPanActiveRef.current = false;
					}
					if (activeTouchPointerDataRef.current.size === 0) {
						setFingerBlockerTouchMode(element, 'default');
					} else {
						setFingerBlockerTouchMode(element, 'none');
					}
				}
				// Camera re-locking when the gesture ends is handled by the touchend listener
				// below, since tldraw may have captured these pointer IDs (preventing
				// pointerup from reliably reaching FingerBlocker for captured pointers).
			}
		};

		const handlePointerCancel = (e: PointerEvent) => {
			setFingerBlockerTouchMode(element, 'default');

			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				unlockScroll();

				const target = e.target as HTMLElement;
				if (target.hasPointerCapture(e.pointerId)) {
					try {
						target.releasePointerCapture(e.pointerId);
					} catch {
						// Ignore
					}
				}
			} else if (e.pointerType === 'touch') {
				activeTouchPointerDataRef.current.delete(e.pointerId);
				if (onVerticalTouchPanRef.current) {
					twoFingerVerticalPanActiveRef.current = false;
					if (activeTouchPointerDataRef.current.size === 0) {
						setFingerBlockerTouchMode(element, 'default');
					}
				}
			}
		}

		const handleWheel = (e: WheelEvent) => {
			if (isPenDownRef.current) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
			}
		};

		const handleTouchMove = (e: TouchEvent) => {
			const isDedicatedVerticalPan =
				twoFingerVerticalPanActiveRef.current ||
				(onVerticalTouchPanRef.current && activeTouchPointerDataRef.current.size > 0);

			if (isPenDownRef.current || twoFingerModeActiveRef.current || isDedicatedVerticalPan) {
				e.preventDefault();
				// stopPropagation required or Obsidian swipe gestures (e.g. command menu) still fire.
				if (isPenDownRef.current || twoFingerModeActiveRef.current || isDedicatedVerticalPan) {
					e.stopPropagation();
					e.stopImmediatePropagation();
				}
			}
		};

		// When an embed pan/zoom gesture calls tlContainer.setPointerCapture(), pointer
		// capture transfers away from this element. The browser fires lostpointercapture
		// here, but pointerup never arrives — so unlockScroll() would never be called and
		// the scroll-pinning mechanism (isPenDownRef + handleScroll) would stay active
		// indefinitely, blocking all scroll attempts even after the gesture ends.
		const handleLostPointerCapture = () => {
			if (isPenDownRef.current) {
				console.debug('[FingerBlocker] lostpointercapture — unlocking scroll');
				unlockScroll();
			}
		};

		// Re-lock tldraw camera when a two-finger gesture ends.
		// Touch Events (touchend/touchcancel) are NOT affected by Pointer Events capture,
		// so this fires reliably even when tldraw has captured the touch pointer IDs via
		// our synthetic pointerdowns in the two-finger activation path above.
		const handleTouchEnd = (e: TouchEvent) => {
			// Keep activeTouchPointerDataRef in sync (Touch Events use .identifier which
			// corresponds to pointerId on all major browsers for touch input)
			Array.from(e.changedTouches).forEach((touch) => {
				activeTouchPointerDataRef.current.delete(touch.identifier);
			});

			if (onVerticalTouchPanRef.current) {
				if (twoFingerVerticalPanActiveRef.current && e.touches.length < 2) {
					twoFingerVerticalPanActiveRef.current = false;
				}
				if (e.touches.length === 0) {
					setFingerBlockerTouchMode(element, 'default');
					activeTouchPointerDataRef.current.clear();
				}
				return;
			}

			if (!enableTwoFingerGestures) return;

			if (twoFingerModeActiveRef.current && e.touches.length < 2) {
				// Restore the camera lock state that was captured when the gesture started,
				// rather than always locking — keeps dedicated view cameras free.
				getTlEditor()?.setCameraOptions({ isLocked: prevCameraLockedRef.current });
				twoFingerModeActiveRef.current = false;
			}
			if (e.touches.length === 0) {
				setFingerBlockerTouchMode(element, 'default');
				activeTouchPointerDataRef.current.clear();
			}
		};

		// Add listeners with passive: false to ensure preventDefault works
		element.addEventListener('pointerdown', handlePointerDown, { passive: false, capture: true });
		element.addEventListener('pointermove', handlePointerMove, { passive: false, capture: true });
		element.addEventListener('pointerup', handlePointerUp, { passive: false, capture: true });
		element.addEventListener('pointercancel', handlePointerCancel, { passive: false, capture: true });
		element.addEventListener('lostpointercapture', handleLostPointerCapture);
		element.addEventListener('wheel', handleWheel, { passive: false, capture: true });
		element.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
		element.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
		element.addEventListener('touchcancel', handleTouchEnd, { passive: true, capture: true });

		return () => {
			element.removeEventListener('pointerdown', handlePointerDown, { capture: true });
			element.removeEventListener('pointermove', handlePointerMove, { capture: true });
			element.removeEventListener('pointerup', handlePointerUp, { capture: true });
			element.removeEventListener('pointercancel', handlePointerCancel, { capture: true });
			element.removeEventListener('lostpointercapture', handleLostPointerCapture);
			element.removeEventListener('wheel', handleWheel, { capture: true });
			element.removeEventListener('touchmove', handleTouchMove, { capture: true });
			element.removeEventListener('touchend', handleTouchEnd, { capture: true });
			element.removeEventListener('touchcancel', handleTouchEnd, { capture: true });
		};
	}, [enableTwoFingerGestures, onVerticalTouchPan]);

	// Add scroll restoration listener to the scroller itself
	React.useEffect(() => {
		const scroller = getScroller();
		if (!scroller) return;

		const handleScroll = (e: Event) => {
			if (isPenDownRef.current && lockedScrollPosRef.current) {
				// Force restoration
				if (Math.abs(scroller.scrollTop - lockedScrollPosRef.current.y) > 1 || 
					Math.abs(scroller.scrollLeft - lockedScrollPosRef.current.x) > 1) {
					scroller.scrollTo(lockedScrollPosRef.current.x, lockedScrollPosRef.current.y);
				}
			}
		};

		scroller.addEventListener('scroll', handleScroll, { passive: false, capture: true });
		return () => {
			scroller.removeEventListener('scroll', handleScroll, { capture: true });
		};
	}, [getTlEditor]); // Re-run if editor changes (likely component mounted/unmounted)

	// Helper function to check if a store entry indicates a tool change
	const hasToolChanged = (entry: { changes?: { updated?: unknown } }): boolean => {
		if (!entry.changes?.updated) return false;
		
		for (const [from, to] of Object.values(entry.changes.updated as Record<string, [unknown, unknown]>)) {
			if (
				typeof from === 'object' && from !== null &&
				typeof to === 'object' && to !== null &&
				'typeName' in from && 'typeName' in to &&
				from.typeName === 'instance' && to.typeName === 'instance'
			) {
				return true;
			}
		}
		return false;
	};

	// Helper function to wrap a tool's pointer handlers with scroll locking
	const wrapToolWithScrollHandlers = (
		tool: ToolWithPointerHandlers
	): (() => void) => {
		// Save tool's previous handlers
		const prevDown = tool.onPointerDown;
		const prevUp = tool.onPointerUp;
		const prevMove = tool.onPointerMove;

		// Assign tool new handlers
		tool.onPointerDown = (e: TLPointerEventInfo) => {
			pointerDownRef.current = true;
			lockScroll();
			prevDown?.(e);
		};
		tool.onPointerUp = (e: TLPointerEventInfo) => {
			pointerDownRef.current = false;
			unlockScroll();
			prevUp?.(e);
		};
		tool.onPointerMove = (e: TLPointerEventInfo) => {
			prevMove?.(e);
		};

		// Return cleanup function to restore original handlers
		return () => {
			if (tool) {
				tool.onPointerDown = prevDown;
				tool.onPointerUp = prevUp;
				tool.onPointerMove = prevMove;
			}
		};
	};

	// Helper function to listen for tool changes and update handlers accordingly
	const listenForToolChangesAndUpdateHandlers = (): (() => void) => {
		const editor = getTlEditor();
		if (!editor) return () => {}; // Return no-op cleanup if editor not available

		const handleToolChange = () => {
			const editor = getTlEditor();
			if (!editor) return;

			const newToolId = editor.getCurrentToolId();
			const previousToolId = currentTldrawToolIdRef.current;

			// If tool hasn't changed, do nothing
			if (newToolId === previousToolId) return;

			// Restore handlers on previous tool (if it exists and we've modified it)
			if (previousToolId && tldrawToolCleanupMap.current.has(previousToolId)) {
				const cleanup = tldrawToolCleanupMap.current.get(previousToolId);
				if (cleanup) {
					cleanup();
					tldrawToolCleanupMap.current.delete(previousToolId);
				}
			}

			// Set up handlers for new tool
			if (newToolId) {
				const tool = editor.getCurrentTool() as ToolWithPointerHandlers | null;
				if (tool) {
					if (!tldrawToolCleanupMap.current.has(newToolId)) {
						// Wrap tool with scroll handlers and track it
						const toolCleanupFn = wrapToolWithScrollHandlers(tool);
						tldrawToolCleanupMap.current.set(newToolId, toolCleanupFn);
						currentTldrawToolIdRef.current = newToolId;
					}
				}
			}
		};

		// Set up store listener to detect tool changes
		return editor.store.listen((entry) => {
			if (hasToolChanged(entry)) {
				handleToolChange();
			}
		}, {
			source: 'all',
			scope: 'all'
		});
	};

	// Helper function to poll until editor becomes available
	const listenForEditorToBecomeAvailable = (
		getTlEditor: () => Editor | undefined,
		onEditorReady: (editor: Editor) => void
	): (() => void) => {
		let pollInterval: number | null = null;
		let setupComplete = false;
		let retryCount = 0;

		pollInterval = window.setInterval(() => {
			if (setupComplete) return;

			const editor = getTlEditor();
			if (editor) {
				setupComplete = true;
				onEditorReady(editor);

				if (pollInterval) {
					window.clearInterval(pollInterval);
					pollInterval = null;
				}
			}

			retryCount++;
			if (retryCount >= MAX_POLL_RETRIES) {
				// Stop polling after max retries to avoid infinite polling
				if (pollInterval) {
					window.clearInterval(pollInterval);
					pollInterval = null;
				}
			}
		}, POLL_INTERVAL_MS);

		return () => {
			if (pollInterval) {
				window.clearInterval(pollInterval);
			}
		};
	};

	React.useEffect(() => {
		let storeListenerCleanup: (() => void) | null = null;

		// Start polling for editor availability
		const stopPolling = listenForEditorToBecomeAvailable(getTlEditor, () => {
			// Editor is available, set up initial tool handlers
			const editor = getTlEditor();
			if (!editor) return;

			const initialToolId = editor.getCurrentToolId();
			if (initialToolId) {
				const tool = editor.getCurrentTool() as ToolWithPointerHandlers | null;
				if (tool) {
					// Verify the tool ID matches (safety check)
					const editorToolId = editor.getCurrentToolId();
					if (editorToolId === initialToolId && !tldrawToolCleanupMap.current.has(initialToolId)) {
						// Wrap tool with scroll handlers and track it
						const cleanup = wrapToolWithScrollHandlers(tool);
						tldrawToolCleanupMap.current.set(initialToolId, cleanup);
						currentTldrawToolIdRef.current = initialToolId;
					}
				}
			}
			// Start listening for tool changes
			storeListenerCleanup = listenForToolChangesAndUpdateHandlers();
		});

		return () => {
			stopPolling();
			if (storeListenerCleanup) {
				storeListenerCleanup();
			}
			// Restore all modified tools
			tldrawToolCleanupMap.current.forEach((cleanup) => {
				cleanup();
			});
			tldrawToolCleanupMap.current.clear();
		};
	}, [getTlEditor]);

	return (
		<div
			ref={blockerRef}
			style={{
				position: 'absolute',
				inset: 0,
				zIndex: 1000,
				userSelect: 'none',
				WebkitUserSelect: 'none',
				MozUserSelect: 'none',
				msUserSelect: 'none',
			}}
			// Fallback that's useful only if hover is supported
			// Fires on pointer hover and also pointer up (Because the blocker reappears)
			onPointerEnter={(e) => {			closeKeyboard();
		}}
			// Fallback that's useful only if hover is supported
			// Fires on pointer leave and also pointer down (Because the blocker dissappears)
			// onPointerLeave={() => {
			// 	console.log('pointer leave!!!!');
			// 	unlockScroll();
			// }}

			// onWheel={(e) => {
			// 	const scroller = getScroller();
			// 	if (scroller) {
			// 		scroller.scrollTo({
			// 			top: scroller.scrollTop + e.deltaY,
			// 			left: scroller.scrollLeft + e.deltaX,
			// 		});
			// 	}
			// }}
		/>
	);
}


