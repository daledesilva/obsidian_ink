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
	onDuplicateClick: Function,
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
            ) : (<>
                <button
                    onClick = {() => props.onEditClick()}
                >
                    Edit
                </button>
                <button
                    onClick = {() => props.onOpenClick()}
                >
                    Open
                </button>

                -

                <button
                    onClick = {() => props.onDuplicateClick()}
                >
                    Duplicate
                </button>
            </>)}

            
        </div>
	</>

};


export default TransitionMenuBar;