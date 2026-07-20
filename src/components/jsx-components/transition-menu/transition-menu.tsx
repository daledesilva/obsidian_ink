import { UnlockIcon } from "src/graphics/icons/unlock-icon";
import "./transition-menu.scss";
import * as React from "react";
import OverflowMenu, { type MenuOption } from "../overflow-menu/overflow-menu";
import { TooltipButton } from "../tooltip-button/tooltip-button";

//////////
//////////

export const TransitionMenu: React.FC<{
	onEditClick: () => void,
	menuOptions: MenuOption[],
}> = (props) => {

	return <>
		<div
            className = 'ink_transition_menu'
        >
            <TooltipButton
                tooltip='Unlock to edit'
                onClick={() => props.onEditClick()}
            >
                <UnlockIcon/>
            </TooltipButton>
            <OverflowMenu
                menuOptions = {props.menuOptions}
            />
        </div>
	</>

};

export default TransitionMenu;