import * as React from 'react';
import type { Editor, TLPointerEventInfo } from '@tldraw/tldraw';

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
};

export function FingerBlocker({ getTlEditor, wrapperRef }: FingerBlockerProps) {
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
		return wrapper ? (wrapper.querySelector('.tl-canvas') as HTMLElement | null) : null;
	};

	const getScroller = (): HTMLElement | null => {
		const wrapper = getWrapper();
		return wrapper ? (wrapper.closest('.cm-scroller') as HTMLElement | null) : null;
	};

	const lockScroll = () => {
		const scroller = getScroller();
		if (scroller) {
			// Ref-based state tracking for scroll restoration
			activeScrollerRef.current = scroller;
			lockedScrollPosRef.current = { x: scroller.scrollLeft, y: scroller.scrollTop };
			
			// Visual styling
			scroller.style.overflow = 'hidden';
			scroller.style.scrollbarColor = 'transparent transparent';
		}
	};

	const unlockScroll = () => {
		if (isPenDownRef.current) {
			isPenDownRef.current = false;
			if (activeScrollerRef.current) {
				// Visual styling
				activeScrollerRef.current.style.overflow = 'auto';
				setTimeout(() => {
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
				scroller.style.overflow = 'auto';
				setTimeout(() => {
					scroller.style.scrollbarColor = 'auto';
				}, 200);
			}
		}
	};

	const closeKeyboard = () => {
		const active = document.activeElement as HTMLElement | null;
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
				// Lock Scroll: Find scroller and set overflow hidden
				lockScroll();
				isPenDownRef.current = true;

				// Dynamically prevent touch gestures for Pen (keep this as backup)
				element.style.touchAction = 'none';

				// Aggressively stop browser handling (scrolling/selection)
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();

				const target = e.target as HTMLElement;
				try {
					target.setPointerCapture(e.pointerId);
				} catch (err) {
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
				// Explicitly allow touch actions for Finger
				element.style.touchAction = 'pan-x pan-y';
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
			} else if (e.pointerType === 'touch' && recentPenInputRef.current) {
				// Logic to manually scroll if needed
				// ie. If it was the first finger touch since a pen stroke, it was unlocked too late, so scroll manually.
				const scroller = getScroller();
				if (scroller) {
					scroller.scrollTo({
						top: scroller.scrollTop - e.movementY,
						left: scroller.scrollLeft - e.movementX,
					});
				}
			}
		};

		const handlePointerUp = (e: PointerEvent) => {
			// Reset touch-action
			element.style.touchAction = '';
			
			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				unlockScroll();
				
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				
				const target = e.target as HTMLElement;
				if (target.hasPointerCapture(e.pointerId)) {
					try {
						target.releasePointerCapture(e.pointerId);
					} catch (err) {
						// Ignore
					}
				}
			} else if (e.pointerType === 'touch') {
				recentPenInputRef.current = false;
			}
		};

		const handlePointerCancel = (e: PointerEvent) => {
			element.style.touchAction = '';

			if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
				unlockScroll();

				const target = e.target as HTMLElement;
				if (target.hasPointerCapture(e.pointerId)) {
					try {
						target.releasePointerCapture(e.pointerId);
					} catch (err) {
						// Ignore
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
			if (isPenDownRef.current) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
			}
		};

		// Add listeners with passive: false to ensure preventDefault works
		element.addEventListener('pointerdown', handlePointerDown, { passive: false, capture: true });
		element.addEventListener('pointermove', handlePointerMove, { passive: false, capture: true });
		element.addEventListener('pointerup', handlePointerUp, { passive: false, capture: true });
		element.addEventListener('pointercancel', handlePointerCancel, { passive: false, capture: true });
		element.addEventListener('wheel', handleWheel, { passive: false, capture: true });
		element.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });

		return () => {
			element.removeEventListener('pointerdown', handlePointerDown, { capture: true });
			element.removeEventListener('pointermove', handlePointerMove, { capture: true });
			element.removeEventListener('pointerup', handlePointerUp, { capture: true });
			element.removeEventListener('pointercancel', handlePointerCancel, { capture: true });
			element.removeEventListener('wheel', handleWheel, { capture: true });
			element.removeEventListener('touchmove', handleTouchMove, { capture: true });
		};
	}, []);

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
		let pollInterval: NodeJS.Timeout | null = null;
		let setupComplete = false;
		let retryCount = 0;

		pollInterval = setInterval(() => {
			if (setupComplete) return;

			const editor = getTlEditor();
			if (editor) {
				setupComplete = true;
				onEditorReady(editor);

				if (pollInterval) {
					clearInterval(pollInterval);
					pollInterval = null;
				}
			}

			retryCount++;
			if (retryCount >= MAX_POLL_RETRIES) {
				// Stop polling after max retries to avoid infinite polling
				if (pollInterval) {
					clearInterval(pollInterval);
					pollInterval = null;
				}
			}
		}, POLL_INTERVAL_MS);

		return () => {
			if (pollInterval) {
				clearInterval(pollInterval);
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
			onPointerEnter={(e) => {
				console.log('pointer enter!!!!');
				closeKeyboard();
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


