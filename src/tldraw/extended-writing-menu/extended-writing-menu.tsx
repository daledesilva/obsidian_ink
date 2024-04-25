import { LockIcon } from "src/graphics/icons/lock-icon";
import "./extended-writing-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";

//////////
//////////

export const ExtendedWritingMenu: React.FC<{
	onLockClick: Function,
}> = (props) => {

	return <>
		<div
            className = 'ink_extended-writing-menu'
        >
            <button
                onClick = {() => props.onLockClick()}
            >
                <LockIcon/>
            </button>
            <button
                className = "ddc_ink_btn-slim"
                onClick = {() => {
                    console.log('show menu');
                    // props.onOverflowClick();
                }}
            >
                <OverflowIcon/>
            </button>
        </div>
	</>

};

export default ExtendedWritingMenu;