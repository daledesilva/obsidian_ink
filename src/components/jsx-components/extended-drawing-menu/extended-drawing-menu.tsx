import { LockIcon } from "src/graphics/icons/lock-icon";
import { ExpandIcon } from "src/graphics/icons/expand-icon";
import { SaveCameraIcon } from "src/graphics/icons/save-camera-icon";
import "./extended-drawing-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";
import OverflowMenu, { type MenuOption } from "../overflow-menu/overflow-menu";
import { TooltipButton } from "../tooltip-button/tooltip-button";

//////////
//////////

export const ExtendedDrawingMenu: React.FC<{
	onLockClick?: () => void,
	onExpandClick?: () => void,
	onSaveCameraClick?: () => void,
	isSaveCameraEnabled?: boolean,
	menuOptions: MenuOption[],
}> = (props) => {

	const showSaveCamera = props.isSaveCameraEnabled === true;

	return <>
		<div
            className = 'ink_extended-writing-menu'
        >
            {props.onExpandClick && (
                <TooltipButton
                    tooltip='Open in full view'
                    onClick={() => props.onExpandClick?.()}
                >
                    <ExpandIcon />
                </TooltipButton>
            )}
			{(showSaveCamera || props.onLockClick) && (
				<div className="ddc_ink_btn-group ddc_ink_btn-group--save-camera">
					{showSaveCamera && props.onSaveCameraClick && (
						<TooltipButton
							tooltip='Save camera position.'
							className="ddc_ink_btn-group__btn ddc_ink_btn-group__btn--accent"
							onClick={() => props.onSaveCameraClick?.()}
						>
							<SaveCameraIcon />
						</TooltipButton>
					)}
					{props.onLockClick && (
						<TooltipButton
							tooltip='Lock'
							className="ddc_ink_btn-group__btn"
							onClick={() => props.onLockClick?.()}
						>
							<LockIcon/>
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