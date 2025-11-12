import * as React from 'react';
import type { Editor, TLPointerEventInfo } from 'tldraw';

// 检测是否为iOS设备
function isIOSDevice(): boolean {
  const userAgent = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
}

// 检测是否为Apple Pencil或其他专业笔输入
function isPenInput(e: React.PointerEvent): boolean {
  // 优先识别pointerType为'pen'的事件 (主要针对Apple Pencil)
  if (e.pointerType === 'pen') return true;

  // 对于iOS设备上的touch事件，需要特别处理
  if (e.pointerType === 'touch' && isIOSDevice()) {
    // iOS上的Apple Pencil在某些情况下会被识别为touch
    // 但通常具有以下特征之一
    const hasAdvancedFeatures = (e.pressure > 0 && e.pressure !== 0.5) || e.tiltX !== 0 || e.tiltY !== 0;
    const isSmallTouch = e.width < 10 && e.height < 10;
    
    // 在iOS上，我们降低检测笔的敏感度，优先考虑手指滚动
    return hasAdvancedFeatures && isSmallTouch;
  }

  return false;
}

type FingerBlockerProps = {
	getTlEditor: () => Editor | undefined;
	wrapperRef?: React.RefObject<HTMLDivElement>;
};

export function FingerBlocker({ getTlEditor, wrapperRef }: FingerBlockerProps) {
	const blockerRef = React.useRef<HTMLDivElement>(null);
	const pointerDownRef = React.useRef<boolean>(false);
	const recentPenInputRef = React.useRef<boolean>(false);
	const isIOSRef = React.useRef<boolean>(false);
	const activeTouchPointers = React.useRef<Map<number, React.PointerEvent>>(new Map()); // 用于跟踪活跃的触摸点
	const touchStartTimeRef = React.useRef<Map<number, number>>(new Map()); // 记录每个触摸点的开始时间
	const touchTimerRef = React.useRef<Map<number, NodeJS.Timeout>>(new Map()); // 记录每个触摸点的计时器

	// 长按阈值（毫秒） - iOS通常使用500ms作为长按阈值
	const LONG_PRESS_THRESHOLD = 500;
	// 移动阈值（像素）- 避免微小抖动误判为移动
	const MOVE_THRESHOLD = 3;
	// 边缘检测阈值（像素）- 检测是否在屏幕边缘滑动
	const EDGE_THRESHOLD = 50;

	// 检测是否为边缘滑动（可能触发Obsidian侧边栏或命令行）
	const isEdgeSwipe = (e: React.PointerEvent): boolean => {
		// 检测左侧边缘滑动（可能触发Obsidian左侧边栏）
		if (e.clientX <= EDGE_THRESHOLD && Math.abs(e.movementX) > 0) {
			return true;
		}
		
		// 检测右侧边缘滑动（可能触发Obsidian右侧边栏）
		if (e.clientX >= window.innerWidth - EDGE_THRESHOLD && Math.abs(e.movementX) > 0) {
			return true;
		}
		
		// 检测顶部向下滑动（可能触发Obsidian命令行）
		if (e.clientY <= EDGE_THRESHOLD && e.movementY > 0) {
			return true;
		}
		
		// 检测底部向上滑动（可能触发Obsidian命令行）
		if (e.clientY >= window.innerHeight - EDGE_THRESHOLD && e.movementY < 0) {
			return true;
		}
		
		return false;
	};

	// 初始化时检测设备类型
	React.useEffect(() => {
		// 检测是否为iOS设备
		isIOSRef.current = isIOSDevice();
	}, []);

	// 获取编辑器画布
	const getCanvas = (): HTMLElement | null => {
		const editor = getTlEditor?.();
		if (!editor) return null;
		// 使用编辑器容器获取画布元素
		const wrapper = getWrapper();
		return wrapper ? (wrapper.querySelector(".tl-canvas") as HTMLElement | null) : null;
	};

	// 获取包装器元素
	const getWrapper = (): HTMLElement | null => {
		return wrapperRef?.current || null;
	};

	const getScroller = (): HTMLElement | null => {
		const wrapper = getWrapper();
		return wrapper ? (wrapper.closest(".cm-scroller") as HTMLElement | null) : null;
	};

	const lockScroll = () => {
		const scroller = getScroller();
		if (scroller) {
			scroller.style.overflow = "hidden";
			scroller.style.scrollbarColor = "transparent transparent";
		}
	};

	const unlockScroll = () => {
		const scroller = getScroller();
		if (scroller) {
			scroller.style.overflow = "auto";
			setTimeout(() => {
				scroller.style.scrollbarColor = "auto";
			}, 200);
		}
	};

	const closeKeyboard = () => {
		const active = document.activeElement as HTMLElement | null;
		if (active && !active.classList.contains("tl-canvas")) {
			active.blur();
		}
	};

	// 转发事件到画布的通用函数
	const forwardEventToCanvas = (e: React.PointerEvent, preventDefault: boolean = true, stopPropagation: boolean = true) => {
		const canvas = getCanvas();
		if (canvas) {
			const forwarded = new PointerEvent(e.type, {
				pointerId: e.pointerId,
				pointerType: e.pointerType,
				clientX: e.clientX,
				clientY: e.clientY,
				bubbles: true,
				screenX: e.screenX,
				screenY: e.screenY,
				buttons: e.buttons,
				pressure: e.pressure,
				tiltX: e.tiltX,
				tiltY: e.tiltY,
			});
			canvas.dispatchEvent(forwarded);
		}
		// 尊重传入的参数，根据需要阻止默认行为和冒泡
		// 这样可以确保在iOS设备上正确处理双指缩放
		if (preventDefault) {
			e.preventDefault();
		}
		if (stopPropagation) {
			e.stopPropagation();
		}
	};

	// 处理iOS设备上的特殊情况
	const handleIOSEvent = (e: React.PointerEvent, eventType: 'down' | 'move' | 'up' | 'cancel') => {
		const isPenOrMouse = isPenInput(e) || e.pointerType === 'mouse';

		if (eventType === 'down') {
			activeTouchPointers.current.set(e.pointerId, e);
			touchStartTimeRef.current.set(e.pointerId, Date.now());
		} else if (eventType === 'up' || eventType === 'cancel') {
			activeTouchPointers.current.delete(e.pointerId);
			touchStartTimeRef.current.delete(e.pointerId);
			// 清除对应的计时器
			const timer = touchTimerRef.current.get(e.pointerId);
			if (timer) {
				clearTimeout(timer);
				touchTimerRef.current.delete(e.pointerId);
			}
		}

		// 获取实际的手指触摸点数（排除笔和鼠标）
		const numTouchPointers = Array.from(activeTouchPointers.current.values()).filter(p => p.pointerType === 'touch').length;

		if (isPenOrMouse) {
			// 鼠标和笔事件：转发到画布，阻止默认行为和冒泡
			forwardEventToCanvas(e);
			if (eventType === 'down') {
				recentPenInputRef.current = true;
			}
		} else if (e.pointerType === 'touch') {
			// 手指触摸事件
			recentPenInputRef.current = false;

			// 对于双指及以上触摸，我们简化处理：
			// 直接转发到画布，但允许冒泡，这样tldraw可以处理缩放和旋转
			// 不阻止默认行为，让iOS的原生缩放机制也能工作
			if (numTouchPointers >= 2) {
				forwardEventToCanvas(e, false, false);
				return;
			}

			// 单指触摸：保持原有逻辑
		if (numTouchPointers === 1) {
			// 触摸停留时间判断：如果小于500毫秒，直接书写；否则允许滚动
			const touchStartTime = touchStartTimeRef.current.get(e.pointerId);
			const touchDuration = touchStartTime ? Date.now() - touchStartTime : 0;
			const shouldScroll = touchDuration >= 500;

			if (!shouldScroll || pointerDownRef.current) {
				// 触摸时间小于500毫秒或有书写操作正在进行，直接转发到画布进行书写
				forwardEventToCanvas(e);
			} else {
				// 触摸时间大于等于500毫秒且没有书写操作，允许滚动
				// 关键修改：不阻止事件，让Obsidian处理边缘滑动和滚动
				// 移除所有stopPropagation和preventDefault调用
				const scroller = getScroller();
				if (scroller) {
					scroller.scrollTop += e.movementY;
					scroller.scrollLeft += e.movementX;
				}
			}
		}
		}
	};

	// 清理函数
	React.useEffect(() => {
		return () => {
			// 清理所有计时器
			for (const timer of touchTimerRef.current.values()) {
				clearTimeout(timer);
			}
			touchTimerRef.current.clear();
		};
	}, []);

	return (
		<div
			ref={blockerRef}
			style={{
		position: 'absolute',
		inset: 0,
		zIndex: 1000, // 提高z-index确保完全覆盖，防止事件穿透
		userSelect: 'none',
		WebkitUserSelect: 'none',
		MozUserSelect: 'none',
		msUserSelect: 'none',
		// 恢复原来的设置：iOS设备拦截事件，非iOS设备不拦截
		pointerEvents: isIOSRef.current ? 'auto' : 'none',
	}}
			onPointerEnter={(e) => {
				const isPenOrMouse = isPenInput(e) || e.pointerType === 'mouse';
				if (isPenOrMouse) {
					lockScroll();
					closeKeyboard();
				} else {
					unlockScroll();
					closeKeyboard();
				}
			}}
			onContextMenu={(e) => {
			// 对于所有设备，确保tldraw的右键菜单能正确显示
			const canvas = getCanvas();
			const editor = getTlEditor();
			
			// 阻止浏览器默认右键菜单
			e.preventDefault();
			
			// 不阻止事件冒泡，让事件能够到达tldraw内部的处理逻辑
			// 这样tldraw可以正常处理右键菜单
			
			// 如果找到画布和编辑器，也尝试直接在画布上触发contextmenu事件
			if (canvas && editor) {
				// 创建新的MouseEvent并转发到画布
				const forwarded = new MouseEvent('contextmenu', {
					clientX: e.clientX,
					clientY: e.clientY,
					bubbles: true,
					composed: true,  // 确保事件能穿过shadow DOM
					screenX: e.screenX,
					screenY: e.screenY,
					buttons: e.buttons,
					view: window,
					detail: e.detail,
					ctrlKey: e.ctrlKey,
					metaKey: e.metaKey,
					altKey: e.altKey,
					shiftKey: e.shiftKey,
					cancelable: true
				});
				
				try {
					// 触发canvas的contextmenu事件
					canvas.dispatchEvent(forwarded);
				} catch (error) {
					console.log('Error dispatching contextmenu event:', error);
				}
			}
			}}
			onPointerDown={(e) => {
				if (isIOSRef.current) {
					handleIOSEvent(e, 'down');
				} else {
					// 对于非iOS设备，也需要区分触摸和笔/鼠标
					const isPenOrMouse = isPenInput(e) || e.pointerType === 'mouse';
					if (isPenOrMouse) {
						forwardEventToCanvas(e);
						recentPenInputRef.current = true;
					} else if (e.pointerType === 'touch') {
						activeTouchPointers.current.set(e.pointerId, e);
						touchStartTimeRef.current.set(e.pointerId, Date.now());
						// 设置一个500毫秒的计时器
						touchTimerRef.current.set(e.pointerId, setTimeout(() => {
							// 计时器触发后，标记这个触摸点可以滚动
							touchTimerRef.current.delete(e.pointerId);
						}, 500));
						const numTouchPointers = Array.from(activeTouchPointers.current.values()).filter(p => p.pointerType === 'touch').length;
						if (numTouchPointers === 1) {
							// 单指触摸：优先考虑是否需要转发到画布进行操作，而不是直接阻止事件
							if (pointerDownRef.current) {
								// 如果pointerDownRef.current为true，说明有书写操作正在进行
								forwardEventToCanvas(e);
							} else {
								// 触摸时间小于500毫秒，直接转发到画布进行书写
								forwardEventToCanvas(e);
							}
						} else if (numTouchPointers >= 2) {
							// 双指及以上触摸：转发到画布，但对于iOS设备需要特别处理缩放
							// 阻止默认行为但允许冒泡，这样既可以让tldraw处理缩放，又不会触发系统默认行为
							forwardEventToCanvas(e, true, false);
						}
						recentPenInputRef.current = false;
					}
				}
			}}
			onPointerMove={(e) => {
				try {
					if (isIOSRef.current) {
						handleIOSEvent(e, 'move');
					} else {
						const isPenOrMouse = isPenInput(e) || e.pointerType === 'mouse';
						if (isPenOrMouse) {
							forwardEventToCanvas(e);
						} else if (e.pointerType === 'touch') {
							activeTouchPointers.current.set(e.pointerId, e);
							const numTouchPointers = Array.from(activeTouchPointers.current.values()).filter(p => p.pointerType === 'touch').length;
							
							if (numTouchPointers === 1) {
			// 单指触摸：优先考虑是否需要转发到画布进行操作，而不是直接滚动
			const touchStartTime = touchStartTimeRef.current.get(e.pointerId);
			const touchDuration = touchStartTime ? Date.now() - touchStartTime : 0;
			const shouldScroll = touchDuration >= 500;

			if (!shouldScroll || pointerDownRef.current) {
				// 触摸时间小于500毫秒或有书写操作正在进行，直接转发到画布进行书写
				forwardEventToCanvas(e);
			} else {
				// 触摸时间大于等于500毫秒且没有书写操作，执行滚动
				// 关键修改：不阻止事件，让Obsidian处理边缘滑动和滚动
				const scroller = getScroller();
				if (scroller) {
					scroller.scrollTop += e.movementY;
					scroller.scrollLeft += e.movementX;
				}
			}
				} else if (numTouchPointers >= 2) {
							// 双指及以上触摸：转发到画布，但对于iOS设备需要特别处理缩放
							// 阻止默认行为但允许冒泡，这样既可以让tldraw处理缩放，又不会触发系统默认行为
							forwardEventToCanvas(e, true, false);
						}
					}
				}
			} catch (error) {
				// 捕获并静默处理任何错误，避免影响用户体验
				console.debug('Pointer move event error:', error);
			}
			}}
				onPointerUp={(e) => {
			if (isIOSRef.current) {
				handleIOSEvent(e, 'up');
			} else {
				const isPenOrMouse = isPenInput(e) || e.pointerType === 'mouse';
				if (isPenOrMouse) {
					forwardEventToCanvas(e);
				} else if (e.pointerType === 'touch') {
					recentPenInputRef.current = false;
					activeTouchPointers.current.delete(e.pointerId);
					touchStartTimeRef.current.delete(e.pointerId);
					// 清除对应的计时器
					const timer = touchTimerRef.current.get(e.pointerId);
					if (timer) {
						clearTimeout(timer);
						touchTimerRef.current.delete(e.pointerId);
					}
					const numTouchPointers = Array.from(activeTouchPointers.current.values()).filter(p => p.pointerType === 'touch').length;
					
					// 如果还有其他手指在屏幕上，转发事件到画布，不阻止默认行为和冒泡
					// 否则，如果所有手指都抬起，则不转发，因为tldraw可能已经处理了up事件
					if (numTouchPointers >= 1) {
						forwardEventToCanvas(e, false, false);
					}
				}
			}
		}}
			onPointerLeave={() => {
				if (!pointerDownRef.current) {
					recentPenInputRef.current = false;
					unlockScroll();
				}
			}}
			onWheel={(e) => {
				e.stopPropagation();
				// 只在iOS设备上阻止默认滚动行为，避免passive事件监听器错误
				if (isIOSRef.current) {
					try {
						e.preventDefault();
					} catch (error) {
						// 如果preventDefault失败（如在passive事件中），静默处理
						console.debug('preventDefault failed in wheel event:', error);
					}
				}
				const scroller = getScroller();
				if (scroller) {
					scroller.scrollTop += e.deltaY;
					scroller.scrollLeft += e.deltaX;
				}
			}}
		/>
	);
}