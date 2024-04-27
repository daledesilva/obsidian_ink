import { LockIcon } from "src/graphics/icons/lock-icon";
import "./extended-drawing-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";
import OverflowButton from "../overflow-button/overflow-button";

//////////
//////////

export const ExtendedDrawingMenu: React.FC<{
	onLockClick: Function,
	overflowOptions: any[],
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
            <OverflowButton
                menuOptions = {props.overflowOptions}
            />
        </div>
	</>

};

export default ExtendedDrawingMenu;