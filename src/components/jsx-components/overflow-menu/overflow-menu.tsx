import "./overflow-menu.scss";
import * as React from "react";
import { OverflowIcon } from "src/graphics/icons/overflow-icon";
import { Menu } from "obsidian";

interface menuOption {
    text: string,
    action: Function,
}

export const OverflowMenu: React.FC<{
    menuOptions: menuOption[]
}> = (props) => {

    const handleMenuClick = (e: React.MouseEvent) => {
        const menu = new Menu();

        props.menuOptions.forEach(menuOption => {
            menu.addItem((item) =>
                item
                    .setTitle(menuOption.text)
                    .onClick(() => {
                        menuOption.action();
                    })
            );
        });

        // 获取按钮元素的位置
        const buttonElement = e.currentTarget as HTMLElement;
        const rect = buttonElement.getBoundingClientRect();
        
        // 在移动端使用更可靠的定位方法
        if (window.innerWidth <= 896) {
            // 移动端：在按钮下方显示菜单
            menu.showAtPosition({
                x: rect.left,
                y: rect.bottom + 5
            });
        } else {
            // 电脑端：使用鼠标事件定位
            menu.showAtMouseEvent(e.nativeEvent);
        }
    };

    return <>
        <div className="ddc_ink_overflow-button-and-menu">
            <button
                className="ddc_ink_btn-slim"
                onClick={handleMenuClick}
            >
                <OverflowIcon />
            </button>
        </div>
    </>
};

export default OverflowMenu;