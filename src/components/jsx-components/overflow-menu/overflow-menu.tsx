import { Menu, MenuItem } from "obsidian";
import "./overflow-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";

//////////
//////////

interface MenuItemOption {
    text: string;
    action: () => void;
    warning?: boolean;
}

interface MenuSeparator {
    separator: true;
}

export type MenuOption = MenuItemOption | MenuSeparator;

function isSeparator(option: MenuOption): option is MenuSeparator {
    return 'separator' in option && option.separator === true;
}

export const OverflowMenu: React.FC<{
    menuOptions: MenuOption[]
}> = (props) => {

    const menuRef = React.useRef<Menu | null>(null);
    const isMenuOpenRef = React.useRef(false);

    return <>
        <div className="ddc_ink_overflow-button-and-menu">
            <button
                className="ddc_ink_btn-slim"
                onClick={(e) => {
                    if (isMenuOpenRef.current && menuRef.current) {
                        menuRef.current.hide();
                        isMenuOpenRef.current = false;
                        return;
                    }
                    const menu = new Menu();
                    props.menuOptions.forEach((option) => {
                        if (isSeparator(option)) {
                            menu.addSeparator();
                            return;
                        }
                        menu.addItem((item: MenuItem) => {
                            item
                                .setTitle(option.text)
                                .onClick(() => { void option.action(); });
                            if (option.warning) {
                                const domMaybe = (
                                    item as MenuItem & { dom?: Element }
                                ).dom;
                                domMaybe?.addClass('mod-warning');
                            }
                        });
                    });
                    menu.onHide(() => {
                        isMenuOpenRef.current = false;
                        menuRef.current = null;
                    });
                    menuRef.current = menu;
                    isMenuOpenRef.current = true;
                    menu.showAtMouseEvent(e.nativeEvent);
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