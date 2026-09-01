import { CheckIcon } from "src/graphics/icons/check-icon";
import "./extended-writing-menu.scss";
import * as React from "react";
import OverflowMenu, { type MenuOption } from "../overflow-menu/overflow-menu";
import { TooltipButton } from "../tooltip-button/tooltip-button";

//////////
//////////

export const ExtendedWritingMenu: React.FC<{
	onLockClick?: () => void,
	menuOptions: MenuOption[],
}> = (props) => {

	return <>
		<div
            className = 'ink_extended-writing-menu'
        >
            {props.onLockClick && (
                <TooltipButton
                    tooltip='Finish editing'
                    onClick={() => props.onLockClick?.()}
                >
                    <CheckIcon />
                </TooltipButton>
            )}
            <OverflowMenu
                menuOptions = {props.menuOptions}
            />
        </div>
	</>

};

export default ExtendedWritingMenu;