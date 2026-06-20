import "./overflow-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";
import { buildMenuFromOptions, showMenuOptionsAtMouseEvent } from "./show-menu-options";

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

export const OverflowMenu: React.FC<{
    menuOptions: MenuOption[]
}> = (props) => {

    const menuRef = React.useRef<ReturnType<typeof buildMenuFromOptions> | null>(null);
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
                    const menu = showMenuOptionsAtMouseEvent(props.menuOptions, e.nativeEvent);
                    menu.onHide(() => {
                        isMenuOpenRef.current = false;
                        menuRef.current = null;
                    });
                    menuRef.current = menu;
                    isMenuOpenRef.current = true;
                }}
            >
                <OverflowIcon />
            </button>
        </div>
    </>

};

export default OverflowMenu;
