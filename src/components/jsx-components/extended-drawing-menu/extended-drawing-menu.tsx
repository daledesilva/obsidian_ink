import { LockIcon } from "src/graphics/icons/lock-icon";
import { ExpandIcon } from "src/graphics/icons/expand-icon";
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
	menuOptions: MenuOption[],
}> = (props) => {

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
            {props.onLockClick && (
                <TooltipButton
                    tooltip='Lock'
                    onClick={() => props.onLockClick?.()}
                >
                    <LockIcon/>
                </TooltipButton>
            )}
            <OverflowMenu
                menuOptions = {props.menuOptions}
            />
        </div>
	</>

};

export default ExtendedDrawingMenu;