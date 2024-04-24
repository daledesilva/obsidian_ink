import { UnlockIcon } from "src/graphics/icons/unlock-icon";
import "./transition-menu.scss";
import * as React from "react";

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
            {/* <button>...</button> */}
            {/* <button
                onClick = {() => props.onDuplicateClick()}
            >
                Duplicate
            </button>             */}
        </div>
	</>

};

export default TransitionMenu;