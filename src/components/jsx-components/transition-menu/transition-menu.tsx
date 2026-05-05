import { UnlockIcon } from "src/graphics/icons/unlock-icon";
import "./transition-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";
import OverflowMenu from "../overflow-menu/overflow-menu";
import { TooltipButton } from "../tooltip-button/tooltip-button";

//////////
//////////

export const TransitionMenu: React.FC<{
	onEditClick: Function,
	menuOptions: any[],
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