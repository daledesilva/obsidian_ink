import "../writing-menu/writing-menu.scss";
import * as React from "react";
import { UndoIcon } from "src/graphics/icons/undo-icon";
import { RedoIcon } from "src/graphics/icons/redo-icon";
import { SelectIcon } from "src/graphics/icons/select-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { DrawIcon } from "src/graphics/icons/draw-icon";
import { Editor } from "tldraw";
import { silentlyChangeStore } from "src/components/formats/v1-code-blocks/utils/tldraw-helpers";

// 颜色映射表
const TL_COLOR_TO_HEX_MAP: Record<string, string> = {
  // 黑色系
  'black': '#1d1d1d',
  // 灰色系
  'grey': '#808080',
  // 紫色系
  'light-violet': '#c084fc',
  'violet': '#a855f7',
  // 蓝色系
  'blue': '#3b82f6',
  'light-blue': '#60a5fa',
  // 黄色和橙色系
  'yellow': '#fbbf24',
  'orange': '#f97316',
  // 绿色系
  'green': '#10b981',
  'light-green': '#34d399',
  // 红色系
  'light-red': '#f87171',
  'red': '#ef4444',
  // 白色系
  'white': '#ffffff'
};

// 定义默认颜色选项
const DEFAULT_COLOR_NAMES = ["black","grey","light-violet","violet","blue","light-blue","yellow","orange","green","light-green","light-red","red","white"];
//////////
//////////

export enum tool {
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}
interface DrawingMenuProps {
    getTlEditor: () => Editor | undefined,
    onStoreChange: (elEditor: Editor) => void,
}

export const DrawingMenu = React.forwardRef<HTMLDivElement, DrawingMenuProps>((props, ref) => {

    const [curTool, setCurTool] = React.useState<tool>(tool.draw);
	const [canUndo, setCanUndo] = React.useState<boolean>(false);
	const [canRedo, setCanRedo] = React.useState<boolean>(false);
	const [brushSize, setBrushSize] = React.useState(2);
	const [brushColor, setBrushColor] = React.useState("light-blue"); // 默认颜色为 light-blue
	const [brushOpacity, setBrushOpacity] = React.useState(100); // 默认透明度为 100%
    React.useEffect( () => {
        // console.log('MENUBAR MOUNTED');
        
        let removeUserActionListener: () => void;
        
        const mountDelayMs = 100;
        setTimeout( () => {
            const tlEditor = props.getTlEditor();
            if(!tlEditor) return;

            let timeout: NodeJS.Timeout;
            removeUserActionListener = tlEditor.store.listen((entry) => {
                clearTimeout(timeout);
                timeout = setTimeout( () => { // TODO: Create a debounce helper
                    setCanUndo( tlEditor.getCanUndo() );
                    setCanRedo( tlEditor.getCanRedo() );
                }, 100);
            }, {
                source: 'all',
                scope: 'all'	// Filters some things like camera movement changes. But Not sure it's locked down enough, so leaving as all.
            })
        }, mountDelayMs);

        return () => {
            if (removeUserActionListener) {
                removeUserActionListener();
            }
        };
    }, []);

    ///////////

    function undo() {
		const editor = props.getTlEditor();
		if (!editor) return;
		silentlyChangeStore( editor, () => {
			editor.undo();
		});
		props.onStoreChange(editor)
	}
	function redo() {
		const editor = props.getTlEditor();
		if (!editor) return;
		silentlyChangeStore( editor, () => {
			editor.redo();
		});
		props.onStoreChange(editor)

	}
	function activateSelectTool() {
		const editor = props.getTlEditor();
		if (!editor) return;
		editor.setCurrentTool('select');
		setCurTool(tool.select);
	}
	function activateDrawTool() {
		const editor = props.getTlEditor();
		if (!editor) return;
		editor.setCurrentTool('draw');
		setCurTool(tool.draw);
	}
	function activateEraseTool() {
		const editor = props.getTlEditor();
		if (!editor) return;
		editor.setCurrentTool('eraser');
		setCurTool(tool.eraser);
	}
    const handleBrushSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        const size = parseInt(e.target.value);
        setBrushSize(size);
      
        const tlEditor = props.getTlEditor();
        if (tlEditor && tlEditor.styleProps && tlEditor.styleProps.geo) {
          // 将笔刷大小映射到 DefaultSizeStyle 的枚举值
          let sizeLevel: string;
          if (size === 1) {
            sizeLevel = "s"; // 小
          } else if (size === 2) {
            sizeLevel = "m"; // 中
          } else if (size === 3) {
            sizeLevel = "l"; // 大
          } else if (size === 4) {
            sizeLevel = "xl"; // 超大
          } else {
            sizeLevel = "m"; // default case
          }
      
          // 找到 size 的样式属性对象
          for (const [key, value] of tlEditor.styleProps.geo.entries()) {
            if (value === "size") {
              key.defaultValue = sizeLevel; // 修改 size 的默认值
              break;
            }
          }
      
          props.onStoreChange(tlEditor); // 通知编辑器更新
        }
      };
      
      const handleBrushColorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        e.stopPropagation();
        const color = e.target.value;
        setBrushColor(color);
      
        const tlEditor = props.getTlEditor();
        if (tlEditor && tlEditor.styleProps && tlEditor.styleProps.geo) {
          // 找到 color 的样式属性对象
          for (const [key, value] of tlEditor.styleProps.geo.entries()) {
            if (value === "color") {
              key.defaultValue = color; // 修改 color 的默认值
              break;
            }
          }
      
          props.onStoreChange(tlEditor); // 通知编辑器更新
        }
      };

      const handleBrushOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        const opacity = parseInt(e.target.value);
        setBrushOpacity(opacity);
      
        const tlEditor = props.getTlEditor();
        if (tlEditor) {
          // 将百分比透明度转换为0-1范围
          const normalizedOpacity = opacity / 100;
          
          // 使用tldraw的正确方法设置透明度
          // 设置后续创建形状的透明度
          tlEditor.setOpacityForNextShapes(normalizedOpacity);
          
          // 如果当前有选中的形状，也设置它们的透明度
          const selectedShapes = tlEditor.getSelectedShapes();
          if (selectedShapes.length > 0) {
            tlEditor.setOpacityForSelectedShapes(normalizedOpacity);
          }
          
          props.onStoreChange(tlEditor); // 通知编辑器更新
        }
      };
    ///////////
    ///////////

    return <>
        <div
            className='ink_other-menu'
        >
            <div
                className='ink_quick-menu'
            >
                <button
                    onPointerDown={undo}
                    disabled={!canUndo}
                >
                    <UndoIcon/>
                </button>
                <button
                    onPointerDown={redo}
                    disabled={!canRedo}
                >
                    <RedoIcon/>
                </button>
            </div>
        </div>
        <div
            ref = {ref}
            className = 'ink_menu-bar'
        >
            <div
                className='ink_tool-menu'
            >
                <button
                    onPointerDown={activateSelectTool}
                    disabled={curTool === tool.select}
                >
                    <SelectIcon/>
                </button>
                <button
                    onPointerDown={activateDrawTool}
                    disabled={curTool === tool.draw}
                >
                    <DrawIcon/>
                </button>
                <button
                    onPointerDown={activateEraseTool}
                    disabled={curTool === tool.eraser}
                >
                    <EraseIcon/>
                </button>
                <button className="ink_brush-controls">
                    <input
                        type="range"
                        min="1"
                        max="4"
                        value={brushSize}
                        onChange={handleBrushSizeChange}
                        className="ink_brush-size"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <div className="ink_brush-color-picker">
                        <div className="ink_brush-color-current" 
                             style={{backgroundColor: TL_COLOR_TO_HEX_MAP[brushColor] || brushColor}}
                             onClick={(e) => {
                                 e.stopPropagation();
                                 e.currentTarget.parentElement?.classList.toggle('ink_brush-color-open');
                             }}
                        />
                        <div className="ink_brush-color-options">
                            <div className="ink_brush-color-options-grid">
                                {DEFAULT_COLOR_NAMES.map((color: string) => (
                                    <div
                                        key={color}
                                        className="ink_brush-color-option"
                                        style={{backgroundColor: TL_COLOR_TO_HEX_MAP[color] || color}}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setBrushColor(color);
                                            
                                            // 直接更新编辑器中的笔刷颜色
                                            const tlEditor = props.getTlEditor();
                                            if (tlEditor && tlEditor.styleProps && tlEditor.styleProps.geo) {
                                                // 找到 color 的样式属性对象
                                                for (const [key, value] of tlEditor.styleProps.geo.entries()) {
                                                    if (value === "color") {
                                                        key.defaultValue = color; // 修改 color 的默认值
                                                        break;
                                                    }
                                                }
                                                props.onStoreChange(tlEditor); // 通知编辑器更新
                                            }
                                            
                                            e.currentTarget.closest('.ink_brush-color-picker')?.classList.remove('ink_brush-color-open');
                                        }}
                                        title={color}
                                    />
                                ))}
                            </div>
                            {/* 透明度调节滑块 - 保持在颜色选择器内部下方 */}
                            <div className="ink_brush-opacity-controls">
                                <div className="ink_brush-opacity-label">透明度: {brushOpacity}%</div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={brushOpacity}
                                    onChange={handleBrushOpacityChange}
                                    className="ink_brush-opacity"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </div>
                    </div>
                </button>  
            </div>
        </div>
    </>;

});

export default DrawingMenu;