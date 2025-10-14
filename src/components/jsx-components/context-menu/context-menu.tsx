import * as React from "react";
import { Editor } from "tldraw";
import "./context-menu.scss";

interface ContextMenuProps {
  getTlEditor: () => Editor | undefined;
  onStoreChange: (editor: Editor) => void;
}

// 菜单覆盖组件，确保所有菜单都有足够高的z-index和正确的定位
const MenuWrapper: React.FC<any> = (props) => {
  console.log(`MenuWrapper: 渲染菜单组件 ${props.Component?.displayName || props.name || '未知'}`);
  return (
    <div style={{ zIndex: 5000, position: 'fixed' }}>
      <props.Component {...props}>
        {props.children}
      </props.Component>
    </div>
  );
};

// 主ContextMenu组件，负责与tldraw编辑器集成，但不再手动处理右键菜单事件
const ContextMenu: React.FC<ContextMenuProps> = (props) => {
  // 可以在这里进行其他与编辑器相关的初始化或状态管理，但不再监听contextmenu事件
  React.useEffect(() => {
    const checkEditor = () => {
      const editor = props.getTlEditor();
      if (!editor) {
        console.log("ContextMenu: 编辑器实例不可用，100ms后重试");
        setTimeout(checkEditor, 100);
        return;
      }
      console.log("ContextMenu: 成功获取编辑器实例");
      // 如果有其他需要对编辑器实例进行的操作，可以在这里添加
    };
    checkEditor();
  }, [props.getTlEditor]);

  // 不需要渲染任何内容，只需要确保tldraw组件能够正确接收到menuOverrides
  return null;
};

// 菜单覆盖配置 - 根据tldraw v1版本的成功经验，我们需要覆盖所有主要的菜单组件
// 确保它们有足够高的z-index和正确的定位
// 这与v1版本的uiOverrides功能相同，但适配current版本的组件结构
export const menuOverrides = {
  // 确保上下文菜单(右键菜单)正确显示
  ContextMenu: MenuWrapper,
  
  // 确保画布菜单(空白处右键菜单)正确显示
  CanvasMenu: MenuWrapper,
  
  // 确保形状菜单(选中元素后右键菜单)正确显示
  ShapeMenu: MenuWrapper,
  
  // 添加Menu容器覆盖，确保菜单z-index足够高
  Menu: MenuWrapper,
  
  // 添加其他可能的菜单相关组件覆盖
  QuickActions: MenuWrapper,
  MenuButton: MenuWrapper,
  MenuSeparator: MenuWrapper,
  MenuItem: MenuWrapper
};

export default ContextMenu;
export { ContextMenu };