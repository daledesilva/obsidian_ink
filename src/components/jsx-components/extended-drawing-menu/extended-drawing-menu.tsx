import { LockIcon } from "src/graphics/icons/lock-icon";
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
							tooltip={showSaveCamera ? 'Abandon framing' : 'Lock'}
							className="ddc_ink_btn-group__btn"
							onClick={() => props.onLockClick?.()}
						>
							<LockIcon/>
						</TooltipButton>
					)}
					{showSaveCamera && props.onSaveCameraClick && (
						<TooltipButton
							tooltip='Save framing'
							className="ddc_ink_btn-group__btn ddc_ink_btn-group__btn--accent"
							onClick={() => props.onSaveCameraClick?.()}
						>
							<LockFrameIcon />
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