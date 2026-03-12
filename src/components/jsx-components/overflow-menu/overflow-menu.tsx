import { Menu, Notice } from "obsidian";
import "./overflow-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";

//////////
//////////

interface MenuItemOption {
    text: string;
    action: Function;
}

interface MenuSeparator {
    separator: true;
}

type MenuOption = MenuItemOption | MenuSeparator;

function isSeparator(option: MenuOption): option is MenuSeparator {
    return 'separator' in option && option.separator === true;
}

export const OverflowMenu: React.FC<{
    menuOptions: MenuOption[]
}> = (props) => {

    const menu = new Menu();

    props.menuOptions.forEach((option) => {
        if (isSeparator(option)) {
            menu.addSeparator();
            return;
        }
        menu.addItem((item) =>
            item
                .setTitle(option.text)
                .onClick(() => {
                    option.action();
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