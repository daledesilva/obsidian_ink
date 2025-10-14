import "./writing-menu.scss";
import * as React from "react";
import { WriteIcon } from "src/graphics/icons/write-icon";
import { EraseIcon } from "src/graphics/icons/erase-icon";
import { SelectIcon } from "src/graphics/icons/select-icon";
import { UndoIcon } from "src/graphics/icons/undo-icon";
import { RedoIcon } from "src/graphics/icons/redo-icon";
import { Editor } from "tldraw";
import { Activity, getActivityType, silentlyChangeStore } from "src/components/formats/v1-code-blocks/utils/tldraw-helpers";

// 定义默认颜色选项
const DEFAULT_COLOR_NAMES = ["black","grey","light-violet","violet","blue","light-blue","yellow","orange","green","light-green","light-red","red","white"];
//////////
//////////

export enum tool {
	select = 'select',
	draw = 'draw',
	eraser = 'eraser',
}
interface WritingMenuProps {
    getTlEditor: () => Editor | undefined,
    onStoreChange: (elEditor: Editor) => void,
}

export const WritingMenu = (props: WritingMenuProps) => {

    const [curTool, setCurTool] = React.useState<tool>(tool.draw);
	const [canUndo, setCanUndo] = React.useState<boolean>(false);
	const [canRedo, setCanRedo] = React.useState<boolean>(false);
	const [brushSize, setBrushSize] = React.useState(2);
	const [brushColor, setBrushColor] = React.useState("light-blue"); // 默认颜色为 light-blue

    React.useEffect( () => {
        // console.log('MENUBAR MOUNTED');
        
        let removeUserActionListener: () => void;
        
        // Arbitrary delay to know when editor has fully mounted and exists
        // TODO: Could try every 100ms until succeeds?
        const mountDelayMs = 200;
        setTimeout( () => {
            const tlEditor = props.getTlEditor();
            if(!tlEditor) return;

            // 主动设置默认颜色到编辑器
            // 创建一个模拟的change事件对象
            const mockEvent = {
                stopPropagation: () => {},
                target: {
                    value: brushColor
                }
            } as React.ChangeEvent<HTMLSelectElement>;
            
            // 调用颜色变更处理函数，确保默认颜色应用到编辑器
            handleBrushColorChange(mockEvent);

            let timeout: NodeJS.Timeout;
            removeUserActionListener = tlEditor.store.listen((entry) => {
                const activity = getActivityType(entry);
                if (activity === Activity.PointerMoved) return;
                
                clearTimeout(timeout);
                timeout = setTimeout( () => { // TODO: Create a debounce helper
                    setCanUndo( tlEditor.getCanUndo() );
                    setCanRedo( tlEditor.getCanRedo() );
                }, 100);
            }, {
                source: 'user',
                scope: 'all'	// Filters some things like camera movement changes. But Not sure it's locked down enough, so leaving as all.
            })
        }, mountDelayMs);

        return () => {
            if (removeUserActionListener) {
                removeUserActionListener()
            }
        };
    }, [brushColor]);

    ///////////

    function undo() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		silentlyChangeStore( tlEditor, () => {
			tlEditor.undo();
		});
        setCanUndo( tlEditor.getCanUndo() );
		props.onStoreChange(tlEditor)
	}
	function redo() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		silentlyChangeStore( tlEditor, () => {
			tlEditor.redo();
		});
        setCanRedo( tlEditor.getCanRedo() );
		props.onStoreChange(tlEditor)

	}
	function activateSelectTool() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		tlEditor.setCurrentTool('select');
		setCurTool(tool.select);

	}
	function activateDrawTool() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		tlEditor.setCurrentTool('draw');
		setCurTool(tool.draw);
	}
	function activateEraseTool() {
		const tlEditor = props.getTlEditor();
		if (!tlEditor) return;
		tlEditor.setCurrentTool('eraser');
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

    ///////////
    ///////////

    return <>
        <div
            className = 'ink_menu-bar'
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
                    <WriteIcon/>
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
                    <select
                        value={brushColor}
                        onChange={handleBrushColorChange}
                        className="ink_brush-color"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                    {DEFAULT_COLOR_NAMES.map((color: string) => (
                        <option key={color} value={color}>
                            {color}
                        </option>
                    ))}
                    </select>
                </button>   
            </div>
            <div
                className='ink_other-menu'
            >
            
            </div>
        </div>
    </>;

};

export default WritingMenu;