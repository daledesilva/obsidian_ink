import { LockIcon } from "src/graphics/icons/lock-icon";
import "./extended-drawing-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";
import OverflowMenu from "../overflow-menu/overflow-menu";

//////////
//////////

export const ExtendedDrawingMenu: React.FC<{
	onLockClick?: Function,
	menuOptions: any[],
}> = (props) => {

	return <>
		<div
            className = 'ink_extended-writing-menu'
        >
            {props.onLockClick && (
                <button
                    onPointerDown = {() => props.onLockClick()}
                >
                    <LockIcon/>
                </button>            
            )}
            <OverflowMenu
                menuOptions = {props.menuOptions}
            />
        </div>
	</>

};

export default ExtendedDrawingMenu;