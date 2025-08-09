import { Menu, Notice } from "obsidian";
import "./overflow-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";

//////////
//////////

interface menuOption {
    text: string,
    action: Function,
}

export const OverflowMenu: React.FC<{
    menuOptions: menuOption[]
}> = (props) => {

    const menu = new Menu();

    props.menuOptions.forEach(menuOption => {
        menu.addItem((item) =>
            item
                .setTitle(menuOption.text)
                .onClick(() => {
                    menuOption.action();
                })
        );
    })

    return <>
        <div className="ddc_ink_overflow-button-and-menu">
            <button
                className="ddc_ink_btn-slim"
                onClick={(e) => {
                    menu.showAtMouseEvent(e.nativeEvent);
                    // props.onOverflowClick();
                }}
            >
                <OverflowIcon />
            </button>
        </div>
    </>
    {/* <button>...</button> */ }
    {/* <button
                onClick = {() => props.onCopyClick()}
            >
                Duplicate
            </button>             */}

};

export default OverflowMenu;