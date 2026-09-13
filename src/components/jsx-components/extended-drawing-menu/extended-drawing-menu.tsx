import { CheckIcon } from "src/graphics/icons/check-icon";
import { LockFrameIcon } from "src/graphics/icons/lock-frame-icon";
import "./extended-drawing-menu.scss";
import * as React from "react";
import OverflowMenu, { type MenuOption } from "../overflow-menu/overflow-menu";
import { TooltipButton } from "../tooltip-button/tooltip-button";

//////////
//////////

export const ExtendedDrawingMenu: React.FC<{
	onLockClick?: () => void,
	onSaveCameraClick?: () => void,
	isSaveCameraEnabled?: boolean,
	menuOptions: MenuOption[],
}> = (props) => {

	const showSaveCamera = props.isSaveCameraEnabled === true;

	return <>
		<div
            className = 'ink_extended-writing-menu'
        >
			{(showSaveCamera || props.onLockClick) && (
				<div className="ddc_ink_btn-group ddc_ink_btn-group--lock">
					{props.onLockClick && (
						<TooltipButton
							tooltip={showSaveCamera ? 'Abandon framing' : 'Finish editing'}
							className="ddc_ink_btn-group__btn"
							onClick={() => props.onLockClick?.()}
						>
							<CheckIcon />
						</TooltipButton>
					)}
					{showSaveCamera && props.onSaveCameraClick && (
						// Text label distinguishes persist-framing from the adjacent finish-editing check.
						<TooltipButton
							tooltip='Saving framing'
							className="ddc_ink_btn-group__btn ddc_ink_btn-group__btn--accent ddc_ink_btn-group__btn--frame"
							onClick={() => props.onSaveCameraClick?.()}
						>
							<LockFrameIcon />
							<span className="ddc_ink_btn-group__btn-label">Save framing</span>
						</TooltipButton>
					)}
				</div>
			)}
            <OverflowMenu
                menuOptions = {props.menuOptions}
            />
        </div>
	</>

};

export default ExtendedDrawingMenu;