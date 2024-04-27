import { UnlockIcon } from "src/graphics/icons/unlock-icon";
import "./transition-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";
import OverflowMenu from "../overflow-menu/overflow-menu";

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
            <button
                onClick = {() => props.onEditClick()}
            >
                <UnlockIcon/>
            </button>
            <OverflowMenu
                menuOptions = {props.menuOptions}
            />
        </div>
	</>

};

export default TransitionMenu;