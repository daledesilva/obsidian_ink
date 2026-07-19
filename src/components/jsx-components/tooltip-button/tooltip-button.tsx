import * as React from 'react';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';

//////////
//////////

interface TooltipButtonProps {
	tooltip: string;
	onClick?: () => void;
	onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
	disabled?: boolean;
	className?: string;
	children: React.ReactNode;
}

/**
 * A button that fires its action on click (safe on Android WebView — avoids synthetic
 * click retargeting that occurs with onPointerDown/onPointerUp).
 *
 * Hold for 1 second to reveal a tooltip label. The tooltip disappears on pointer release
 * or when the pointer leaves the button, whichever comes first.
 */
export const TooltipButton: React.FC<TooltipButtonProps> = ({
	tooltip,
	onClick,
	onPointerDown,
	disabled,
	className,
	children,
}) => {
	const [tooltipVisible, setTooltipVisible] = React.useState(false);
	const holdTimerRef = React.useRef<number | null>(null);

	React.useEffect(() => {
		return () => {
			if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
		};
	}, []);

	function startHoldTimer() {
		if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
		holdTimerRef.current = window.setTimeout(() => {
			setTooltipVisible(true);
		}, 1000);
	}

	function handlePointerEnter(e: React.PointerEvent<HTMLButtonElement>) {
		if (e.pointerType === 'mouse') startHoldTimer();
	}

	function dismissTooltip() {
		if (holdTimerRef.current) {
			window.clearTimeout(holdTimerRef.current);
			holdTimerRef.current = null;
		}
		setTooltipVisible(false);
	}

	return (
		<Tippy
			content={tooltip}
			visible={tooltipVisible}
			placement='top'
		>
			<button
				className={className}
				disabled={disabled}
				onPointerEnter={handlePointerEnter}
				onPointerDown={(e) => { startHoldTimer(); onPointerDown?.(e); }}
				onPointerUp={dismissTooltip}
				onPointerLeave={dismissTooltip}
				onPointerCancel={dismissTooltip}
				onClick={onClick}
			>
				{children}
			</button>
		</Tippy>
	);
};

export default TooltipButton;
