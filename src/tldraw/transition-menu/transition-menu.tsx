import { UnlockIcon } from "src/graphics/icons/unlock-icon";
import "./transition-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";
import OverflowButton from "../overflow-button/overflow-button";

//////////
//////////

export const TransitionMenu: React.FC<{
	onEditClick: Function,
	onDuplicateClick: Function,
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
            <OverflowButton
                menuOptions = {[
                    {
                        text: 'Copy',
                        action: props.onDuplicateClick
                    }
                ]}
            />
        </div>
	</>

};

export default TransitionMenu;