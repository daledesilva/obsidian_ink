import { Menu, Notice } from "obsidian";
import "./overflow-button.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";

//////////
//////////

interface menuOption {
    text: string,
    action: Function,
}

export const OverflowButton: React.FC<{
    // onEditClick: Function,
    // onDuplicateClick: Function,
    menuOptions: menuOption[]
}> = (props) => {

    const menu = new Menu();

    props.menuOptions.forEach(menuOption => {
        console.log('menuOption', menuOption)
        menu.addItem((item) =>
            item
                .setTitle(menuOption.text)
                .setIcon("documents")
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
                    console.log('show menu');
                    menu.showAtMouseEvent(e.nativeEvent);
                    // props.onOverflowClick();
                }}
            >
                <OverflowIcon />
            </button>
            {/* TODO: Should actually make this a context menu? */}
            {/* <ul className="ddc_ink_dropdown ddc_ink_visible">
                <li>Option 1</li>
                <li>Option 2</li>
                <li>Option 3</li>
            </ul> */}
        </div>
    </>
    {/* <button>...</button> */ }
    {/* <button
                onClick = {() => props.onDuplicateClick()}
            >
                Duplicate
            </button>             */}

};

export default OverflowButton;