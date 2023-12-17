import * as React from "react";

//////////
//////////

import "./transition-menu-bar.scss";

//////////

export const TransitionMenuBar: React.FC<{
	onOpenClick: Function,
	isEditMode: boolean,
	onEditClick: Function,
	onFreezeClick: Function,
}> = (props) => {

	return <>
		<div
            className = 'ink_transition_menu-bar'
        >
            <button
                onClick = {() => props.onOpenClick()}
            >
                Open
            </button>
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