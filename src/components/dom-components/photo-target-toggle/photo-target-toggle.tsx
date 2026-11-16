import * as React from 'react';
import classNames from 'classnames';
import type { InkPhotoConvertTarget } from 'src/logic/photo-trace/photo-convert-target';
import './photo-target-toggle.scss';

//////////
//////////

export interface PhotoTargetToggleProps {
	target: InkPhotoConvertTarget;
	/**
	 * Accessible name for the pair. Rendered as visually hidden text rather than an
	 * aria-label, because Obsidian shows a tooltip for any element carrying one and the
	 * choice is already visible on the buttons.
	 */
	label: string;
	onChange?: (target: InkPhotoConvertTarget) => void;
	isDisabled?: boolean;
}

const PHOTO_TARGET_OPTIONS: { target: InkPhotoConvertTarget; label: string }[] = [
	{ target: 'writing', label: 'Writing' },
	{ target: 'drawing', label: 'Drawing' },
];

/**
 * Writing or drawing segmented control shared by the thumbnail grid and the corners
 * step, so the same photo keeps one destination no matter which screen sets it.
 */
export const PhotoTargetToggle: React.FC<PhotoTargetToggleProps> = (props) => (
	<div
		className='ddc_ink_photo-target-toggle'
		role='group'
	>
		<span className='ddc_ink_visually-hidden'>{props.label}</span>
		{PHOTO_TARGET_OPTIONS.map((option) => {
			const isActive = option.target === props.target;
			return (
				<button
					key={option.target}
					type='button'
					className={classNames(
						'ddc_ink_photo-target-toggle__option',
						isActive && 'is-active',
					)}
					aria-pressed={isActive}
					disabled={props.isDisabled}
					onClick={() => props.onChange?.(option.target)}
				>
					{option.label}
				</button>
			);
		})}
	</div>
);

export default PhotoTargetToggle;
