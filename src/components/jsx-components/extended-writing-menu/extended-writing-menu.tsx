import "./extended-writing-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";
import { LockIcon } from "src/graphics/icons/lock-icon";
import { OverflowMenu } from "src/components/jsx-components/overflow-menu/overflow-menu";

export const ExtendedWritingMenu: React.FC<{
	onLockClick: Function,
	menuOptions: any[],
}> = (props) => {

	return <>
		<div
            className = 'ink_extended-writing-menu'
        >
            <button
                onPointerDown = {() => props.onLockClick()}
            >
                <LockIcon/>
            </button>            
            <OverflowMenu
                menuOptions = {props.menuOptions}
            />
        </div>
	</>

};

export default ExtendedWritingMenu;