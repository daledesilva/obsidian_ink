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
	// #region agent log D1
	fetch('http://127.0.0.1:7662/ingest/80d354ed-c82d-4bc7-8299-7af3de76375a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a82c9'},body:JSON.stringify({sessionId:'7a82c9',runId:'pre-fix',hypothesisId:'D',location:'extended-drawing-menu.tsx:render',message:'render',data:{showSaveCamera,isSaveCameraEnabled:props.isSaveCameraEnabled,hasOnSave:!!props.onSaveCameraClick,hasOnLock:!!props.onLockClick},timestamp:Date.now()})}).catch(()=>{});
	// #endregion agent log D1

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