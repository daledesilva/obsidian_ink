import * as React from "react";

//////////
//////////

import "./readonly-menu-bar.scss";

//////////

export function ReadonlyMenuBar (props: {
	onEditClick: Function,
}) {

	return <>
		<div
            className = 'ink_readonly_menu-bar'
        >
            <button
                onClick = {() => props.onEditClick()}
            >
                Edit
            </button>
        </div>
	</>

};


export default ReadonlyMenuBar;