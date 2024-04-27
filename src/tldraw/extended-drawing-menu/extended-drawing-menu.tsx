import { LockIcon } from "src/graphics/icons/lock-icon";
import "./extended-drawing-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";
import OverflowButton from "../overflow-button/overflow-button";

//////////
//////////

export const ExtendedDrawingMenu: React.FC<{
	onLockClick: Function,
	onCopyClick: Function,
	onOpenClick: Function,
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
                menuOptions = {[
                    {
                        text: 'Copy',
                        action: props.onCopyClick
                    },
                    {
                        text: 'Open',
                        action: props.onOpenClick
                    },
                    // {
                    //     text: 'Delete',
                    //     action: props.onCopyClick
                    // },
                ]}
            />
        </div>
	</>

};

export default ExtendedDrawingMenu;