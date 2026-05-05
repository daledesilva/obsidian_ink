import { LockIcon } from "src/graphics/icons/lock-icon";
import { ExpandIcon } from "src/graphics/icons/expand-icon";
import "./extended-writing-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";
import OverflowMenu from "../overflow-menu/overflow-menu";

//////////
//////////

export const ExtendedWritingMenu: React.FC<{
	onLockClick?: Function,
	onExpandClick?: Function,
	menuOptions: any[],
}> = (props) => {

	return <>
		<div
            className = 'ink_extended-writing-menu'
        >
            {props.onLockClick && (
                <button
                    onClick = {() => props.onLockClick?.()}
                >
                    <LockIcon/>
                </button>
            )}
            {props.onExpandClick && (
                <button
                    onPointerDown = {() => props.onExpandClick?.()}
                >
                    <ExpandIcon />
                </button>
            )}
            <OverflowMenu
                menuOptions = {props.menuOptions}
            />
        </div>
	</>

};

export default ExtendedWritingMenu;