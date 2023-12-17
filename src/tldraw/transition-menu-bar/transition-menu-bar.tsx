import * as React from "react";

//////////
//////////

import "./transition-menu-bar.scss";

//////////

export const TransitionMenuBar: React.FC<{
	isEditMode: boolean,
	onEditClick: Function,
	onFreezeClick: Function,
}> = (props) => {

	return <>
		<div
            className = 'ink_transition_menu-bar'
        >
            {props.isEditMode ? (
                <button
                    onClick = {() => props.onFreezeClick()}
                >
                    Freeze
                </button>
            ) : (
                <button
                    onClick = {() => props.onEditClick()}
                >
                    Edit
                </button>

            )}
        </div>
	</>

};


export default TransitionMenuBar;