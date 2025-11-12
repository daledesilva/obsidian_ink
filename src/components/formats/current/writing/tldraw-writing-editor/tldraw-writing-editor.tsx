import './tldraw-writing-editor.scss';
import { Editor, getSnapshot, TldrawOptions, Tldraw, defaultTools, defaultShapeTools, defaultShapeUtils, TldrawScribble, TldrawShapeIndicators, TldrawSelectionForeground, TldrawHandles, TLEditorSnapshot, TLShapeId, TLShape, Box, copyAs } from "tldraw";
import { useRef, useState, useMemo, useCallback } from "react";
import { Activity, WritingCameraLimits, adaptTldrawToObsidianThemeMode, focusChildTldrawEditor, getActivityType, getWritingContainerBounds, getWritingSvg, initWritingCamera, initWritingCameraLimits, prepareWritingSnapshot, preventTldrawCanvasesCausingObsidianGestures, resizeWritingTemplateInvitingly, restrictWritingCamera, updateWritingStoreIfNeeded, useStash } from "src/components/formats/current/utils/tldraw-helpers";
import { getGlobals } from 'src/stores/global-store';
import { WritingContainerUtil } from "../shapes/writing-container"
import { WritingMenu } from "src/components/jsx-components/writing-menu/writing-menu";
import InkPlugin from "src/main";
import * as React from "react";
import { MENUBAR_HEIGHT_PX, WRITE_LONG_DELAY_MS, WRITE_SHORT_DELAY_MS, WRITING_LINE_HEIGHT } from 'src/constants';
import { InkFileData } from 'src/components/formats/current/types/file-data';
import { buildWritingFileData } from 'src/components/formats/current/utils/build-file-data';
import { TFile } from 'obsidian';
import { PrimaryMenuBar } from 'src/components/jsx-components/primary-menu-bar/primary-menu-bar';
import ExtendedWritingMenu from 'src/components/jsx-components/extended-writing-menu/extended-writing-menu';
import classNames from 'classnames';
import { WritingLinesUtil } from '../shapes/writing-lines';
import { editorActiveAtom, WritingEmbedState, embedStateAtom } from '../writing-embed/writing-embed';
import { useAtomValue, useSetAtom } from 'jotai';
import { extractInkJsonFromSvg } from 'src/logic/utils/extractInkJsonFromSvg';
import { verbose } from 'src/logic/utils/log-to-console';
import { FingerBlocker } from 'src/components/jsx-components/finger-blocker/finger-blocker';

///////
// 菜单选项类型定义
interface MenuOption {
  label: string;
  onClick: () => void;
  checked?: boolean;
  disabled?: boolean;
  submenu?: MenuOption[];
}

// CustomContextMenu组件 - 全局定义
const CustomContextMenu: React.FC<{
  x: number;
  y: number;
  options: MenuOption[];
  onClose: () => void;
  editor: any;
}> = ({ x, y, options, onClose, editor }) => {
  // x和y已经是相对于视口的绝对坐标，直接使用即可
  const absoluteX = x;
  const absoluteY = y;
  
  const handleMenuItemClick = (onClick: () => void) => {
    console.log('Menu item clicked');
    onClick();
    setTimeout(onClose, 100);
  };
  
  // 子菜单触发器不应该有点击事件，只有悬停效果
  const handleSubmenuTriggerClick = (e: React.MouseEvent) => {
    // 阻止事件冒泡，避免触发父级的点击事件
    e.stopPropagation();
    // 子菜单触发器不应该关闭菜单，只显示子菜单
  };
  
  const handleMouseLeave = useCallback(() => {
    // 鼠标离开菜单时自动关闭
    setTimeout(onClose, 150);
  }, [onClose]);
  
  // 使用状态管理子菜单显示
  const [activeSubmenu, setActiveSubmenu] = useState<number | null>(null);
  
  // 子菜单显示控制
  const [submenuVisible, setSubmenuVisible] = useState<number | null>(null);
  
  // 渲染菜单项
  const renderMenuItem = (opt: MenuOption, index: number) => {
    if (opt.submenu) {
      // 子菜单项 - 使用tldraw官方样式类名
      return (
        <div
          key={index}
          className="tlui-menu__submenu__trigger"
          data-state={activeSubmenu === index ? "open" : "closed"}
          style={{
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: '14px',
            color: 'var(--color-text-0, white)',
            border: 'none',
            background: 'transparent',
            textAlign: 'left',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap',
            overflow: 'visible', // 修改为visible，确保子菜单内容可见
            textOverflow: 'ellipsis',
            borderRadius: '4px',
            margin: '0 4px',
            position: 'relative', // 确保子菜单相对于此容器定位
          }}
          onClick={handleSubmenuTriggerClick} // 添加点击事件处理
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--tl-color-hover, rgba(255, 255, 255, 0.1))';
            setActiveSubmenu(index);
            setSubmenuVisible(index);
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            // 延迟关闭子菜单，避免立即消失
            setTimeout(() => {
              if (submenuVisible !== index) {
                setActiveSubmenu(null);
              }
            }, 500);
          }}
        >
          {opt.label} ▶
          {/* 子菜单 */}
          {activeSubmenu === index && (
            <div
              className="tlui-menu__submenu__content"
              data-size="small"
              style={{
                position: 'absolute',
                top: '-4px', // 调整垂直位置，与触发器对齐
                left: 'calc(100% - 4px)', // 调整水平位置，避免重叠
                background: 'var(--tl-color-panel)',
                color: 'var(--color-text-0, white)',
                borderRadius: 'var(--tl-radius-3)',
                padding: '4px 0',
                boxShadow: 'var(--tl-shadow-3)',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                minWidth: '140px',
                zIndex: 1000,
                pointerEvents: 'auto', // 确保子菜单可以接收鼠标事件
              }}
              onMouseEnter={() => {
                setSubmenuVisible(index);
                setActiveSubmenu(index);
              }}
              onMouseLeave={() => {
            setSubmenuVisible(null);
            setTimeout(() => {
              if (activeSubmenu === index) {
                setActiveSubmenu(null);
              }
            }, 300);
          }}
            >
              {opt.submenu && opt.submenu.length > 0 ? (
                opt.submenu.map((subOpt, subIndex) => (
                  <div
                    key={subIndex}
                    className="tlui-menu__item"
                    onClick={() => handleMenuItemClick(subOpt.onClick)}
                    style={{
                      padding: '8px 16px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      color: 'var(--color-text-0, white)',
                      border: 'none',
                      background: 'transparent',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap',
                      overflow: 'visible', // 修改为visible，确保子菜单内容可见
                      textOverflow: 'ellipsis',
                      borderRadius: '4px',
                      margin: '0 4px',
                      pointerEvents: 'auto', // 确保菜单项可以接收鼠标事件
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tl-color-hover, rgba(255, 255, 255, 0.1))'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {subOpt.checked ? '✓ ' : ''}{subOpt.label}
                  </div>
                ))
              ) : (
                <div style={{ padding: '8px 16px', color: 'var(--color-text-2)', fontSize: '12px' }}>
                  无子菜单项
                </div>
              )}
            </div>
          )}
        </div>
      );
    } else {
      // 普通菜单项 - 使用tldraw官方样式类名
      return (
        <div
          key={index}
          className="tlui-menu__item"
          onClick={() => handleMenuItemClick(opt.onClick)}
          style={{
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: '14px',
            color: 'var(--color-text-0, white)',
            border: 'none',
            background: 'transparent',
            textAlign: 'left',
            transition: 'all 0.2s ease',
            whiteSpace: 'nowrap',
            overflow: 'visible', // 修改为visible，确保子菜单内容可见
            textOverflow: 'ellipsis',
            borderRadius: '4px',
            margin: '0 4px',
            pointerEvents: 'auto', // 确保菜单项可以接收鼠标事件
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tl-color-hover, rgba(255, 255, 255, 0.1))'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {opt.checked ? '✓ ' : ''}{opt.label}
        </div>
      );
    }
  };
  
  return (
    <div
      className="tlui-menu"
      data-size="small"
      style={{
        position: 'fixed',
        top: absoluteY,
        left: absoluteX,
        background: 'var(--tl-color-panel)',
        color: 'var(--color-text-2, #666666)', // 将白色改为灰色
        borderRadius: 'var(--tl-radius-3)',
        padding: '4px 0',
        boxShadow: 'var(--tl-shadow-3)',
        zIndex: 99999, // 使用更高的z-index确保菜单显示在最顶层
        userSelect: 'none',
        minWidth: '120px', // 设置最小宽度
        maxWidth: '200px', // 设置最大宽度
        backdropFilter: 'blur(4px)', // 添加毛玻璃效果
        border: '1px solid rgba(255, 255, 255, 0.1)', // 添加半透明边框
        overflow: 'visible', // 确保子菜单内容可见
      }}
      onMouseLeave={handleMouseLeave}
    >
      <div className="tlui-menu__group">
        {options.map((opt, i) => renderMenuItem(opt, i))}
      </div>
    </div>
  );
};

declare global {
  interface Window {
    contextMenuSaveTimeout?: NodeJS.Timeout;
    menuClickSaveTimeout?: NodeJS.Timeout;
  }
}

interface TldrawWritingEditorProps {
	onResize?: Function,
	plugin: InkPlugin,
	writingFile: TFile,
    save: (inkFileData: InkFileData) => void,
	extendedMenu?: any[],
	initialState?: string, // 控制初始工具状态

	// For embeds
	embedded?: boolean,
	resizeEmbedContainer?: (pxHeight: number) => void,
	closeEditor?: Function,
	saveControlsReference?: Function,
}

// Wraps the component so that it can full unmount when inactive
export const TldrawWritingEditorWrapper: React.FC<TldrawWritingEditorProps> = (props) => {
    const editorActive = useAtomValue(editorActiveAtom);
    if(editorActive) {
        return <TldrawWritingEditor {...props} />
    } else {
        return <></>
    }
}

const MyCustomShapes = [WritingContainerUtil, WritingLinesUtil];
const myOverrides: Record<string, never> = {}
const tlOptions: Partial<TldrawOptions> = {
	defaultSvgPadding: 0
	// 注意：tldraw 4.0.3版本中i18n配置不在TldrawOptions类型中
	// 如果需要国际化支持，请使用其他配置方式
}

export function TldrawWritingEditor(props: TldrawWritingEditorProps) {

	const [tlEditorSnapshot, setTlEditorSnapshot] = React.useState<TLEditorSnapshot>()
	const [currentTool, setCurrentTool] = React.useState<string>('draw')
	const setEmbedState = useSetAtom(embedStateAtom);
	// 右键菜单相关状态
	const [showContextMenu, setShowContextMenu] = useState(false);
	const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
	const showContextMenuRef = useRef(false);
	const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout>();
	const tlEditorRef = useRef<Editor | null>(null);
	const editorWrapperRefEl = useRef<HTMLDivElement>(null);
	const writingZoneRef = useRef<HTMLDivElement>(null);
	const { stashStaleContent, unstashStaleContent } = useStash(props.plugin);
	const cameraLimitsRef = useRef<WritingCameraLimits>();
	const [preventTransitions, setPreventTransitions] = React.useState<boolean>(true);
	const processedShapeIdsRef = useRef<Set<TLShapeId>>(new Set()); // 跟踪已经处理过的形状ID
	const lastStrokeTimeRef = useRef<number>(Date.now()); // 记录最后笔迹时间
	// 使用ref来跟踪writing-zone流式布局的当前位置
	const writingZonePositionRef = useRef<{x: number, y: number} | null>(null);
	// 右键菜单相关引用
	const suppressSavesRef = useRef<boolean>(false); // 控制是否临时阻止保存操作

	// 空格键触发更新一行高度的函数
	const handleSpaceKeyPress = () => {
		const editor = tlEditorRef.current;
		if (!editor || currentTool !== 'draw') return;
		
		// 获取writing-lines容器的边界
		const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId);
		if (!writingLinesShape) {
			console.error('无法找到writing-lines形状');
			return;
		}
		
		const containerBounds = editor.getShapePageBounds(writingLinesShape);
		if (!containerBounds) {
			console.error('无法获取writing-lines形状的边界');
			return;
		}
		
		console.log('容器边界:', {
			x: containerBounds.x,
			y: containerBounds.y,
			width: containerBounds.width,
			height: containerBounds.height
		});
		
		// 计算新的一行高度
		const spaceLineHeight = WRITING_LINE_HEIGHT * 1.5; // 空格键换行高度：1.5倍行高，与流式布局保持一致
		const leftMargin = containerBounds.width * 0.05; // 左边距：5%容器宽度（与流式布局保持一致）
		
		// 更新writing-zone位置到下一行开头
		if (writingZonePositionRef.current) {
			writingZonePositionRef.current = {
				x: leftMargin, // 回到左边距（从0开始）
				y: writingZonePositionRef.current.y + spaceLineHeight // 换到下一行
			};
		} else {
			// 如果没有保存的位置，创建一个新的位置
			writingZonePositionRef.current = {
				x: leftMargin, // 左边距（从0开始）
				y: 0 - spaceLineHeight // 首行位置 - 一行高度
			};
		}
		
		console.log('空格键触发：更新到下一行，新位置:', writingZonePositionRef.current);
	};

	// 键盘事件处理函数
	const handleKeyDown = (e: KeyboardEvent) => {
		const editor = tlEditorRef.current;
		if (!editor) return;
		
		// 检查是否在编辑文本，如果是则跳过快捷键处理
		if (editor.getEditingShapeId() !== null) return;
		
		// 空格键触发更新一行高度
		if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
			e.preventDefault(); // 阻止默认的空格滚动行为
			handleSpaceKeyPress();
		}
		
		// 右键菜单快捷键
		if (e.ctrlKey || e.metaKey) {
			switch (e.key) {
				case 'c': // 复制
					e.preventDefault();
					helpers.copy();
					break;
				case 'x': // 剪切
					e.preventDefault();
					helpers.cut();
					break;
				case 'v': // 粘贴
					e.preventDefault();
					helpers.paste();
					break;
				case 'a': // 全选
					e.preventDefault();
					editor.selectAll();
					break;
				case 'z': // 撤销
					e.preventDefault();
					editor.undo();
					break;
				case 'y': // 重做
					e.preventDefault();
					editor.redo();
					break;
				case 'd': // 复制（重复）
					e.preventDefault();
					helpers.duplicate();
					break;
				case 'Delete': // 删除
				case 'Backspace':
					e.preventDefault();
					editor.deleteShapes(editor.getSelectedShapeIds());
					break;
			}
		}
	};

	// 记忆相机位置的引用
	const cameraPositionRef = useRef<{x: number, y: number, z: number} | null>(null);

	// 移动相机到writing-zone区域的函数
	const moveCameraToWritingZone = () => {
		const editor = tlEditorRef.current;
		if (!editor || !writingZoneRef.current) return;
		
		// 如果已经有记忆的相机位置，直接使用记忆的位置
		if (cameraPositionRef.current) {
			editor.setCamera(cameraPositionRef.current);
			console.log('使用记忆的相机位置:', cameraPositionRef.current);
			return;
		}
		
		// 获取writing-zone的位置信息
		const zoneRect = writingZoneRef.current.getBoundingClientRect();
		const containerRect = editor.getContainer().getBoundingClientRect();
		
		// 计算writing-zone在页面坐标系中的位置
		const zoneX = zoneRect.left - containerRect.left;
		const zoneY = zoneRect.top - containerRect.top;
		const zoneWidth = zoneRect.width;
		const zoneHeight = zoneRect.height;
		
		// 完全取消相机放大，使用正常的缩放比例（与initWritingCamera相同）
		// 放大功能将由放大镜组件实现
		const containerWidth = 2000; // 与initWritingCamera保持一致
		const containerMargin = 0;
		const visibleWidth = containerWidth + 2 * containerMargin;
		const targetZoom = containerRect.width / visibleWidth;
		
		// 计算视野中心点（writing-zone的中心）
		// 修正：确保writing-lines形状能够正确居中
		// writing-lines形状宽度为2000px，容器宽度为containerRect.width
		// 需要将writing-lines形状的中心对准容器中心
		const writingLinesCenterX = containerWidth / 2; // writing-lines形状的中心点
		const containerCenterX = containerRect.width / 2; // 容器中心点
		const centerX = containerCenterX - writingLinesCenterX * targetZoom; // 修正相机位置，使形状居中
		const centerY = zoneY + zoneHeight / 2;
		
		// 计算相机位置：将相机定位在正文区（包含A区和B区）
		// A区：书写内容移动目标区域（原大小，不放大）
		// B区：writing-zone上方，容器中间区域（用于实时显示新笔迹）
		// 正文区：包含A区和B区，确保能看到转移后的内容
		// 修复：相机向上偏移量调整为18%容器高度+45px，确保前两行内容可见且Y=0显示在Y=45的位置
		const cameraOffsetY = -containerRect.height * 0.18 - 45; // 相机向上偏移18%容器高度+45px，定位到正文区
		
		// 修复：首次使用时，确保相机位置能够看到前两行内容
		// 计算writing-lines形状的边界，确保相机位置正确
		const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId);
		let finalCameraY = centerY + cameraOffsetY - containerRect.height / (2 * targetZoom);
		
		if (writingLinesShape) {
			const writingLinesBounds = editor.getShapePageBounds(writingLinesShape);
			if (writingLinesBounds) {
				// 确保相机位置能够看到writing-lines形状的前两行内容
				// 前两行的高度约为2 * WRITING_LINE_HEIGHT
				const firstTwoLinesHeight = 2 * WRITING_LINE_HEIGHT;
				const minVisibleY = writingLinesBounds.y - firstTwoLinesHeight;
				finalCameraY = Math.max(finalCameraY, minVisibleY);
			}
		}
		
		// 设置相机位置和缩放（完全取消放大倍数，使用正常缩放）
		const cameraPosition = {
			x: centerX,
			y: finalCameraY,
			z: targetZoom
		};
		
		editor.setCamera(cameraPosition);
		
		// 记忆相机位置
		cameraPositionRef.current = cameraPosition;
		
		console.log('相机定位到正文区（包含A区和B区），完全取消放大倍数，使用正常缩放:', targetZoom.toFixed(4));
		console.log('相机偏移量:', cameraOffsetY.toFixed(0), 'px');
		console.log('容器尺寸信息:', {
			containerWidth: containerRect.width,
			containerHeight: containerRect.height,
			zoneWidth: zoneWidth,
			zoneHeight: zoneHeight
		});
		console.log('相机水平位置修正：确保writing-lines形状居中，中心点计算:', {
			writingLinesCenterX: writingLinesCenterX,
			containerCenterX: containerCenterX,
			finalCenterX: centerX
		});
		console.log('最终相机Y位置:', finalCameraY.toFixed(2), '确保前两行内容可见');
	};

	// 恢复相机到正常状态的函数
	const restoreNormalCamera = () => {
		const editor = tlEditorRef.current;
		if (!editor) return;
		
		// 使用initWritingCamera的逻辑恢复相机到正常状态
		const containerRect = editor.getContainer().getBoundingClientRect();
		const containerWidth = 2000; // 与initWritingCamera保持一致
		const containerMargin = 0;
		const visibleWidth = containerWidth + 2 * containerMargin;
		const zoom = containerRect.width / visibleWidth;
		
		// 设置相机位置和缩放（恢复到正常状态）
		editor.setCamera({
			x: containerMargin,
			y: props.embedded ? 0 : MENUBAR_HEIGHT_PX,
			z: zoom
		});
		
		console.log('相机已恢复到正常状态，缩放比例:', zoom.toFixed(4));
	};

	// 右键菜单事件处理函数
	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		
		const editor = tlEditorRef.current;
		if (!editor) return;
		
		// 计算右键菜单位置 - 使用相对于视口的绝对坐标
		const x = e.clientX;
		const y = e.clientY;
		
		// 设置菜单显示状态和位置
		setShowContextMenu(true);
		setContextMenuPosition({ x, y });
		
		// 抑制保存，避免在右键菜单操作期间触发保存
		// editor.suppressSave(); // 暂时注释掉，因为该方法可能不存在
	};
	
	// 处理菜单外部点击关闭
	const handleClick = (e: MouseEvent) => {
		if (showContextMenu) {
			setShowContextMenu(false);
		}
	};
	
	// 右键菜单功能函数
	const helpers = useMemo(() => ({
		copy: () => {
			const editor = tlEditorRef.current;
			if (!editor) return;
			
			const selectedShapeIds = editor.getSelectedShapeIds();
			if (selectedShapeIds.length === 0) return;
			
			// 直接实现Tldraw的复制逻辑
			editor.markHistoryStoppingPoint('copy');
			const content = editor.getContentFromCurrentPage(selectedShapeIds);
			
			if (!content) {
				if (navigator && navigator.clipboard) {
					navigator.clipboard.writeText('');
				}
				return;
			}
			
			// 使用版本化的剪贴板格式
			const { assets, ...otherData } = content;
			const clipboardData = {
				type: 'application/tldraw',
				kind: 'content',
				version: 3,
				data: {
					assets: assets || [],
					otherCompressed: require('lz-string').compressToBase64(JSON.stringify(otherData)),
				},
			};
			
			const stringifiedClipboard = JSON.stringify(clipboardData);
			
			if (navigator.clipboard?.write) {
				const htmlBlob = new Blob([`<div data-tldraw>${stringifiedClipboard}</div>`], {
					type: 'text/html',
				});
				
				const textItems = content.shapes
					.map((shape: any) => {
						const util = editor.getShapeUtil(shape);
						return util.getText(shape);
					})
					.filter(Boolean);
				
				let textContent = textItems.join(' ');
				if (textContent === '') {
					textContent = ' ';
				}
				
				navigator.clipboard.write([
					new ClipboardItem({
						'text/html': htmlBlob,
						'text/plain': new Blob([textContent], { type: 'text/plain' }),
					}),
				]);
			} else if (navigator.clipboard.writeText) {
				navigator.clipboard.writeText(`<div data-tldraw>${stringifiedClipboard}</div>`);
			}
		},
		
		cut: () => {
			const editor = tlEditorRef.current;
			if (!editor) return;
			
			const selectedShapeIds = editor.getSelectedShapeIds();
			if (selectedShapeIds.length === 0) return;
			
			// 先复制后删除
			editor.markHistoryStoppingPoint('cut');
			const content = editor.getContentFromCurrentPage(selectedShapeIds);
			
			if (!content) {
				if (navigator && navigator.clipboard) {
					navigator.clipboard.writeText('');
				}
				return;
			}
			
			// 使用版本化的剪贴板格式
			const { assets, ...otherData } = content;
			const clipboardData = {
				type: 'application/tldraw',
				kind: 'content',
				version: 3,
				data: {
					assets: assets || [],
					otherCompressed: require('lz-string').compressToBase64(JSON.stringify(otherData)),
				},
			};
			
			const stringifiedClipboard = JSON.stringify(clipboardData);
			
			if (navigator.clipboard?.write) {
				const htmlBlob = new Blob([`<div data-tldraw>${stringifiedClipboard}</div>`], {
					type: 'text/html',
				});
				
				const textItems = content.shapes
					.map((shape: any) => {
						const util = editor.getShapeUtil(shape);
						return util.getText(shape);
					})
					.filter(Boolean);
				
				let textContent = textItems.join(' ');
				if (textContent === '') {
					textContent = ' ';
				}
				
				navigator.clipboard.write([
					new ClipboardItem({
						'text/html': htmlBlob,
						'text/plain': new Blob([textContent], { type: 'text/plain' }),
					}),
				]);
			} else if (navigator.clipboard.writeText) {
				navigator.clipboard.writeText(`<div data-tldraw>${stringifiedClipboard}</div>`);
			}
			
			// 删除选中的形状
			editor.deleteShapes(selectedShapeIds);
		},
		
		paste: async () => {
			const editor = tlEditorRef.current;
			if (!editor) return;
			
			// 检查是否在编辑文本，如果是则跳过粘贴
			if (editor.getEditingShapeId() !== null) return;
			
			try {
				// 使用Tldraw的粘贴功能
				const clipboardItems = await navigator.clipboard.read();
				const point = editor.getViewportPageBounds().center;
				
				// 使用Tldraw的粘贴处理 - 修复粘贴逻辑
				for (const item of clipboardItems) {
					for (const type of item.types) {
						if (type === 'text/html') {
							const blob = await item.getType(type);
							const html = await blob.text();
							
							// 解析HTML中的tldraw数据
							const parser = new DOMParser();
							const doc = parser.parseFromString(html, 'text/html');
							const tldrawElement = doc.querySelector('[data-tldraw]');
							
							if (tldrawElement) {
								const tldrawData = JSON.parse(tldrawElement.textContent || '{}');
								if (tldrawData.type === 'application/tldraw' && tldrawData.kind === 'content') {
									// 解压缩数据
									const decompressedData = JSON.parse(require('lz-string').decompressFromBase64(tldrawData.data.otherCompressed));
									
									await editor.putExternalContent({
										type: 'tldraw',
										content: {
											shapes: decompressedData.shapes || [],
											bindings: decompressedData.bindings || [],
											rootShapeIds: decompressedData.rootShapeIds || [],
											assets: tldrawData.data.assets || [],
											schema: editor.store.schema.serialize(),
										},
										point,
									});
									return;
								}
							}
						}
					}
				}
			} catch (error) {
				console.error('粘贴失败:', error);
			}
		},
		
		duplicate: () => {
			const editor = tlEditorRef.current;
			if (!editor) return;
			
			const selectedShapeIds = editor.getSelectedShapeIds();
			if (selectedShapeIds.length === 0) return;
			
			// 使用Tldraw内置的复制功能
			editor.duplicateShapes(selectedShapeIds);
		},
	}), []);

	// 创建菜单项处理器，用于处理保存抑制
	const contextMenuSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const createMenuItemHandler = (action: () => void, delay: number = 0) => {
		return () => {
			suppressSavesRef.current = true;
			if (contextMenuSaveTimeoutRef.current) {
				clearTimeout(contextMenuSaveTimeoutRef.current);
			}
			contextMenuSaveTimeoutRef.current = setTimeout(() => {
				suppressSavesRef.current = false;
			}, delay);
			action();
		};
	};

	// 复制为PNG函数
	const copyAsPNG = async () => {
		const editor = tlEditorRef.current;
		if (!editor) return;
		
		const selectedShapeIds = editor.getSelectedShapeIds();
		if (selectedShapeIds.length === 0) return;
		
		try {
			await copyAs(editor, selectedShapeIds, { format: 'png' });
		} catch (error) {
			console.error('复制为PNG失败:', error);
		}
	};
	
	// 获取右键菜单选项
	const getContextMenuOptions = (): MenuOption[] => {
		const editor = tlEditorRef.current;
		if (!editor) return [];
		
		const selectedShapeIds = editor.getSelectedShapeIds();
		const hasSelection = selectedShapeIds.length > 0;
		
		// 基础菜单选项
		const baseMenuOptions = [
			{ label: '复制 Ctrl+C', onClick: createMenuItemHandler(() => helpers.copy()) },
			{ label: '剪切 Ctrl+X', onClick: createMenuItemHandler(() => helpers.cut(), 1500) },
			{ label: '粘贴 Ctrl+V', onClick: createMenuItemHandler(() => helpers.paste()) },
			{ label: '删除 ⌫', onClick: createMenuItemHandler(() => editor.deleteShapes(editor.getSelectedShapeIds())) },
			{ label: '全选 Ctrl+A', onClick: createMenuItemHandler(() => editor.selectAll()) },
		];
		
		// 复制为菜单选项组
		const copyAsMenuOptions = [
			{ 
				label: 'PNG', 
				onClick: createMenuItemHandler(copyAsPNG, 2000),
				disabled: !hasSelection
			}
		];
		
		if (hasSelection) {
			return [
				...baseMenuOptions,
				{ label: '重复 Ctrl+D', onClick: createMenuItemHandler(() => helpers.duplicate()) },
				{ label: '复制为', onClick: () => {}, submenu: copyAsMenuOptions }
			];
		} else {
			return [
				...baseMenuOptions,
				{ label: '复制为', onClick: () => {}, submenu: copyAsMenuOptions }
			];
		}
	};
	
	// On mount
	React.useEffect( ()=> {
		verbose('EDITOR mounted');
		fetchFileData();
		
		// 添加键盘事件监听器
		document.addEventListener('keydown', handleKeyDown);
		// 添加全局点击事件监听器，用于关闭右键菜单
		document.addEventListener('click', handleClick);
		
		return () => {
			verbose('EDITOR unmounting');
			// 移除键盘事件监听器
			document.removeEventListener('keydown', handleKeyDown);
			// 移除全局点击事件监听器
			document.removeEventListener('click', handleClick);
		}
	}, [])

	// 更新基准位置的函数：在工具操作（移动、擦除、撤销等）时更新基准位置，并计算下次移动的目标位置
	const updateWritingZonePositionRef = (editor: Editor) => {
		// 获取writing-lines容器的边界
		const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId);
		if (!writingLinesShape) return;
		
		const containerBounds = editor.getShapePageBounds(writingLinesShape);
		if (!containerBounds) return;
		
		// 流式布局参数
		const lineHeight = WRITING_LINE_HEIGHT; // 换行高度：使用完整的行高（约150px）
		const maxLineWidth = containerBounds.width * 0.4; // 40%容器宽度（适配2000px容器）
		const leftMargin = containerBounds.width * 0.05; // 左边距：5%容器宽度（相当于两个字宽）
		
		// 补偿相机偏移：使用固定的45px补偿值，确保位置一致性
		const cameraOffsetCompensation = 45;
		
		// 获取所有draw形状
		const drawShapes = editor.getCurrentPageShapes().filter(s => s.type === 'draw');
		
		// 如果没有形状，重置到起始位置（首次移动Y值应为0，X值从0开始）
		if (drawShapes.length === 0) {
			writingZonePositionRef.current = {
				x: leftMargin, // 左边距（从0开始）
				y: 0 + cameraOffsetCompensation // 首行位置（Y值从0开始，加上相机偏移补偿）
			};
			console.log('没有形状，基准位置重置到起始位置（X从0开始，Y从0开始加上相机补偿）:', writingZonePositionRef.current);
			return;
		}
		
		// 找到已移动的形状（标记为moved的形状）
		const movedShapes = drawShapes.filter(s => s.meta?.moved);
		
		// 如果没有已移动的形状，使用所有形状中位置最靠后的形状
		const shapesToUse = movedShapes.length > 0 ? movedShapes : drawShapes;
		
		// 改进的参考形状选择逻辑：确保选择当前行最右边的形状，基于正确的可视范围
		let referenceShape: TLShape | null = null;
		let maxXInCurrentRow = -Infinity;
		
		// 首先找到当前行（Y坐标最接近的形状）
		const currentY = writingZonePositionRef.current?.y ?? 0;
		
		// 遍历所有形状，找到当前行最右边的形状
		for (const shape of shapesToUse) {
			const bounds = editor.getShapePageBounds(shape.id);
			if (!bounds) continue;
			
			// 检查是否在同一行（Y坐标差异小于行高的一半）
				const yDiff = Math.abs(bounds.y - currentY);
				if (yDiff < lineHeight / 2) {
					// 在同一行内，选择X坐标最大的形状
					// 确保选择的形状在可视范围内（不超过40%容器宽度）
					const visibleWidth = containerBounds.width * 0.4;
					if (bounds.maxX <= visibleWidth && bounds.maxX > maxXInCurrentRow) {
						maxXInCurrentRow = bounds.maxX;
						referenceShape = shape;
					}
				}
		}
		
		// 如果没有找到当前行的形状，使用原来的逻辑选择最右下角的形状
		if (!referenceShape) {
			referenceShape = shapesToUse.reduce((latest, current) => {
				if (!latest) return current;
				if (!current) return latest;
				
				const currentBounds = editor.getShapePageBounds(current.id);
				const latestBounds = editor.getShapePageBounds(latest.id);
				
				if (!currentBounds || !latestBounds) return latest;
				
				// 比较位置：优先比较Y轴（行），再比较X轴（列）
				// 选择Y轴更大（更下面）的位置，如果Y轴相同则选择X轴更大（更右边）的位置
				// 确保选择的形状在可视范围内
				const visibleWidth = containerBounds.width * 0.4;
				
				// 优先选择在可视范围内的形状
				const currentInVisibleRange = currentBounds.maxX <= visibleWidth;
				const latestInVisibleRange = latestBounds.maxX <= visibleWidth;
				
				if (currentInVisibleRange && !latestInVisibleRange) {
					return current; // 当前形状在可视范围内，而最新形状不在
				} else if (!currentInVisibleRange && latestInVisibleRange) {
					return latest; // 最新形状在可视范围内，而当前形状不在
				} else if (currentBounds.y > latestBounds.y) {
					return current; // 在更下面的行
				} else if (currentBounds.y === latestBounds.y && currentBounds.x > latestBounds.x) {
					return current; // 在同一行但更右边
				}
				return latest;
			}, null as TLShape | null);
		}
		
		if (!referenceShape) {
			writingZonePositionRef.current = {
				x: leftMargin, // 左边距（从0开始）
				y: 0 + cameraOffsetCompensation // 首行位置（Y值从0开始，加上相机偏移补偿）
			};
			console.log('无法找到参考形状，基准位置重置（X从0开始，Y从0开始加上相机补偿）:', writingZonePositionRef.current);
			return;
		}
		
		const referenceBounds = editor.getShapePageBounds(referenceShape.id);
		if (!referenceBounds) {
			writingZonePositionRef.current = {
				x: leftMargin, // 左边距（从0开始）
				y: 0 + cameraOffsetCompensation // 首行位置（Y值从0开始，加上相机偏移补偿）
			};
			console.log('无法获取参考形状边界，基准位置重置（X从0开始，Y从0开始加上相机补偿）:', writingZonePositionRef.current);
			return;
		}
		
		// 计算新的基准位置和目标位置
		let nextTextX: number;
		let nextTextY: number;
		
		// 基于参考形状的位置计算下一个位置
		nextTextX = referenceBounds.maxX + 30; // 在参考形状右边，增加间距到30px
		
		// 保持同一行高度：在同一行内Y坐标保持不变
		// 只有当超出最大行宽时才触发换行，而不是每次转移都触发
		if (nextTextX > maxLineWidth) {
			// 超出可视范围宽度，换到下一行
			nextTextX = leftMargin; // 回到左边距（从0开始）
			// 确保按行高正确递增：使用当前行的Y坐标加上行高
			// 注意：实际形状的Y坐标是0，但需要加上相机补偿让它们看起来在Y=45的位置
			const currentRowY = Math.floor(referenceBounds.y / lineHeight) * lineHeight + cameraOffsetCompensation;
			nextTextY = currentRowY + lineHeight; // 换到下一行
		} else {
			// 同一行内，保持当前行Y坐标不变（确保对齐到行网格）
			// 注意：实际形状的Y坐标是0，但需要加上相机补偿让它们看起来在Y=45的位置
			const currentRowY = Math.floor(referenceBounds.y / lineHeight) * lineHeight + cameraOffsetCompensation;
			nextTextY = currentRowY; // 使用当前行的起始Y坐标
		}
		
		// 转换为绝对坐标并确保位置在容器范围内
		nextTextX = Math.max(leftMargin, nextTextX);
		nextTextY = Math.max(0, nextTextY);
		
		const oldPosition = { ...writingZonePositionRef.current };
		writingZonePositionRef.current = {
			x: nextTextX,
			y: nextTextY
		};
		
		console.log('基准位置已更新:', {
			oldPosition: oldPosition,
			newPosition: { x: nextTextX, y: nextTextY },
			referenceShapeBounds: { 
				x: referenceBounds.x, 
				y: referenceBounds.y,
				maxX: referenceBounds.maxX,
				maxY: referenceBounds.maxY
			},
			containerBounds: {
				y: containerBounds.y,
				height: containerBounds.h
			},
			layoutParams: {
				lineHeight: Math.round(lineHeight),
				maxLineWidth: Math.round(maxLineWidth),
				leftMargin: Math.round(leftMargin),
				cameraOffsetCompensation: Math.round(cameraOffsetCompensation)
			},
			debug: {
				referenceBoundsY: referenceBounds.y,
				calculatedCurrentRowY: Math.floor(referenceBounds.y / lineHeight) * lineHeight + cameraOffsetCompensation
			}
		});
	};

	// Define rectsIntersect helper function before detectAndProcessNewInk
	const rectsIntersect = (r1: { left: number; top: number; right: number; bottom: number }, r2: DOMRect) => {
		return !(r2.left > r1.right ||
				 r2.right < r1.left ||
				 r2.top > r1.bottom ||
				 r2.bottom < r1.top);
	};

	// Define instantInputPostProcess and related functions before queueOrRunStorePostProcesses_current
	const instantInputPostProcess = (editor: Editor) => { //, entry?: HistoryEntry<TLRecord>) => {
		resizeWritingTemplateInvitingly(editor);
		resizeContainerIfEmbed(editor);
		// entry && simplifyLines(editor, entry);
	};

	// Use this to run optimisations that take a small amount of time but should happen frequently
	const smallDelayInputPostProcess = (editor: Editor) => {
		resetShortPostProcessTimer();
		
		shortDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				incrementalSave(editor);
			},
			WRITE_SHORT_DELAY_MS
		)

	};

	// Use this to run optimisations after a slight delay
	const longDelayInputPostProcess = (editor: Editor) => {
		resetLongPostProcessTimer();
		
		longDelayPostProcessTimeoutRef.current = setTimeout(
			() => {
				completeSave(editor);
			},
			WRITE_LONG_DELAY_MS
		)

	};

	const resetShortPostProcessTimer = () => {
		clearTimeout(shortDelayPostProcessTimeoutRef.current);
	}
	const resetLongPostProcessTimer = () => {
		clearTimeout(longDelayPostProcessTimeoutRef.current);
	}
	const resetInputPostProcessTimers = () => {
		resetShortPostProcessTimer();
		resetLongPostProcessTimer();
	}

	// Define incrementalSave and completeSave functions before smallDelayInputPostProcess and longDelayInputPostProcess
	const incrementalSave = async (editor: Editor) => {
		verbose('incrementalSave');
		unstashStaleContent(editor);
		const tlEditorSnapshot = getSnapshot(editor.store);
		const { plugin } = getGlobals();
		const svgObj = await getWritingSvg(editor, {
			writingBackgroundWhenLocked: plugin.settings.writingBackgroundWhenLocked
		});
		stashStaleContent(editor);

        const writingFileData = buildWritingFileData({
		tlEditorSnapshot: tlEditorSnapshot,
		svgString: svgObj?.svg,
	})
		props.save(writingFileData);
	}

	const completeSave = async (editor: Editor): Promise<void> => {
		verbose('completeSave');
        let svgString;
		
		unstashStaleContent(editor);
		const tlEditorSnapshot = getSnapshot(editor.store);
		const { plugin } = getGlobals();
		const svgObj = await getWritingSvg(editor, {
			writingBackgroundWhenLocked: plugin.settings.writingBackgroundWhenLocked
		});
		stashStaleContent(editor);
		
        if (svgObj) {
            svgString = svgObj.svg;
			// if(previewUri) addDataURIImage(previewUri)	// NOTE: Option for testing
		}

        if(svgString) {
            const pageData = buildWritingFileData({
                tlEditorSnapshot: tlEditorSnapshot,
                svgString,
            })
			props.save(pageData);
			// await savePngExport(props.plugin, previewUri, props.fileRef) // REVIEW: Still need a png?

		} else {
            const pageData = buildWritingFileData({
				tlEditorSnapshot: tlEditorSnapshot,
			})
			props.save(pageData);
		}

		return;
	}

	// 围绕内容中心进行真正缩放的函数，就像使用选择工具拖动边角一样
const scaleAllShapesToTargetHeight = (editor: Editor, targetHeight: number) => {
	// 1. 找出所有未标记 moved 的 draw 形状
	const unmarkedShapes = editor.getCurrentPageShapes().filter(
		s => s.type === 'draw' && !s.meta?.moved
	);
	if (unmarkedShapes.length === 0) return;

	// 2. 计算整体包围盒
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const shape of unmarkedShapes) {
		const b = editor.getShapePageBounds(shape.id);
		if (!b) continue;
		minX = Math.min(minX, b.minX);
		minY = Math.min(minY, b.minY);
		maxX = Math.max(maxX, b.maxX);
		maxY = Math.max(maxY, b.maxY);
	}
	const boundsW = maxX - minX;
	const boundsH = maxY - minY;
	if (boundsH <= 0) return;

	const scale = targetHeight / boundsH;
	const centerX = minX + boundsW / 2;
	const centerY = minY + boundsH / 2;

	editor.run(() => {
		for (const shape of unmarkedShapes) {
			if (shape.type !== 'draw') continue;

			const { x: shapeX, y: shapeY } = shape;
			const originalSegments = (shape.props as any)?.segments || [];

			// 1️⃣ 提取所有局部点转为全局坐标
			let allGlobalPoints: { x: number; y: number }[] = [];
			for (const seg of originalSegments) {
				for (const p of seg.points) {
					allGlobalPoints.push({ x: shapeX + p.x, y: shapeY + p.y });
				}
			}

			// 2️⃣ 围绕整体中心缩放所有点
			const scaledGlobalPoints = allGlobalPoints.map(p => ({
				x: centerX + (p.x - centerX) * scale,
				y: centerY + (p.y - centerY) * scale,
			}));

			// 3️⃣ 计算缩放后笔迹的新包围盒（用于更新 shape.x/y）
			let newMinX = Infinity, newMinY = Infinity;
			let i = 0;
			for (const seg of originalSegments) {
				for (let j = 0; j < seg.points.length; j++) {
					const gp = scaledGlobalPoints[i++];
					newMinX = Math.min(newMinX, gp.x);
					newMinY = Math.min(newMinY, gp.y);
				}
			}

			// 4️⃣ 用新的左上角作为 shape.x/y
			const newX = newMinX;
			const newY = newMinY;

			// 5️⃣ 把所有缩放后的全局点转回局部坐标
			i = 0;
			const scaledSegments = originalSegments.map((seg: any)=> ({
				...seg,
				points: seg.points.map((p: any)=> {
					const gp = scaledGlobalPoints[i++];
					return { x: gp.x - newX, y: gp.y - newY, z: p.z };
				}),
			}));

			editor.updateShape({
				id: shape.id,
				type: 'draw',
				x: newX,
				y: newY,
				props: {
					...shape.props,
					segments: scaledSegments,
				},
				meta: { ...(shape.meta || {}), moved: true } as any,
			});
		}

		console.log(`🎯 精准整体缩放完成：目标高度 ${targetHeight}px`, {
			缩放比例: scale.toFixed(3),
			中心: { x: centerX, y: centerY },
			形状数量: unmarkedShapes.length,
		});
	}, { name: 'scale-all-shapes-to-target-height' } as any);
};

	const queueOrRunStorePostProcesses_current = (editor: Editor) => {
		instantInputPostProcess(editor);
		smallDelayInputPostProcess(editor);
		longDelayInputPostProcess(editor);
	}

	const detectAndProcessNewInk = () => {
		const editor = tlEditorRef.current;
		if (!editor || currentTool !== 'draw') return;

		// 声明needsNewLine变量，用于跟踪是否发生换行
		let needsNewLine = false;

		const zoneEl = writingZoneRef.current;
		if (!zoneEl) return;

		const zoneRect = zoneEl.getBoundingClientRect();

		// Get all draw shapes
		const drawShapes = editor.getCurrentPageShapes().filter(s => s.type === 'draw');

		const newInkIds: TLShapeId[] = [];

		for (const shape of drawShapes) {
			// 跳过已经处理过的形状
			if (processedShapeIdsRef.current.has(shape.id)) continue;
			
			const pageBounds = editor.getShapePageBounds(shape.id);
			if (!pageBounds) continue;

			// Convert to screen bounds
			const tlPoint = editor.pageToScreen({ x: pageBounds.minX, y: pageBounds.minY });
			const brPoint = editor.pageToScreen({ x: pageBounds.maxX, y: pageBounds.maxY });

			const screenRect = {
				left: tlPoint.x,
				top: tlPoint.y,
				right: brPoint.x,
				bottom: brPoint.y,
			};

			// Check intersection
			if (rectsIntersect(screenRect, zoneRect)) {
				newInkIds.push(shape.id);
			}
		}

		if (newInkIds.length === 0) return;

		// Select the new ink
		editor.setSelectedShapes(newInkIds);

		// 获取选中的形状
		const selectedShapes = editor.getSelectedShapes();

		// 立即标记这些形状为已处理，避免重复检测
		newInkIds.forEach(id => {
			processedShapeIdsRef.current.add(id);
		});

		// 等待缩放完成后再移动
		setTimeout(() => {
			// 获取writing-lines容器的边界
			const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId);
			if (!writingLinesShape) return;
			
			const containerBounds = editor.getShapePageBounds(writingLinesShape);
			if (!containerBounds) return;

			// 流式布局参数
		const lineHeight = WRITING_LINE_HEIGHT; // 换行高度：使用完整的行高（约150px）
		const maxLineWidth = containerBounds.width * 0.4; // 40%容器宽度（与updateWritingZonePositionRef保持一致）
		const leftMargin = containerBounds.width * 0.05; // 左边距：5%容器宽度（与流式布局保持一致）
		
		// 打印容器宽度信息，用于调试
		console.log('容器宽度 containerBounds.width:', containerBounds.width, 'px');
		console.log('容器宽度 containerBounds.height:', containerBounds.height, 'px');
		// 补偿相机偏移：使用13.2%比例，达到45px的视觉效果
		// 基准位置Y值改为0，但通过相机偏移补偿保持Y=45的视觉效果
		const cameraOffsetCompensation = containerBounds.height * 0.132;
		
		// 简化逻辑：直接使用updateWritingZonePositionRef计算的位置
		// 先更新基准位置，获取正确的目标位置
		updateWritingZonePositionRef(editor);
		
		// 使用基准位置作为目标位置，添加空值检查
		if (!writingZonePositionRef.current) {
			console.error('writingZonePositionRef.current is null');
			return;
		}
		
		let nextTextX = writingZonePositionRef.current.x;
		let nextTextY = writingZonePositionRef.current.y;
		
		// 检查是否需要换行（基于基准位置和目标位置）
		const movedShapes = drawShapes.filter(s => s.meta?.moved);
		const isFirstMove = movedShapes.length === 0;
		
		if (isFirstMove) {
			// 获取writing-lines容器的边界
			const writingLinesShape = editor.getShape('shape:writing-lines' as TLShapeId);
			if (!writingLinesShape) return;
			
			const containerBounds = editor.getShapePageBounds(writingLinesShape);
			if (!containerBounds) return;
			
			// 首次移动强制使用起始位置（Y值从0开始，加上相机偏移补偿）
			const leftMargin = containerBounds.width * 0.05; // 左边距：5%容器宽度
			nextTextX = leftMargin;
			nextTextY = 0 + cameraOffsetCompensation; // 强制使用Y=0，加上相机偏移补偿，忽略基准位置的计算结果
			
			console.log('首次移动，强制使用起始位置:', { nextTextX, nextTextY });
		}
		
		if (!isFirstMove) {
			// 获取所有形状的 bounds
			const boundsList = movedShapes
				.map(shape => {
					const bounds = editor.getShapePageBounds(shape.id);
					return bounds ? { shape, bounds } : null;
				})
				.filter(Boolean) as { shape: TLShape; bounds: Box }[];
			
			if (boundsList.length > 0) {
				// 找到最右下角的形状作为参考
				boundsList.sort((a, b) => {
					if (a.bounds.maxY !== b.bounds.maxY) return a.bounds.maxY - b.bounds.maxY;
					return a.bounds.maxX - b.bounds.maxX;
				});
				
				const reference = boundsList[boundsList.length - 1];
				const ref = reference.bounds;
				
				// 检查是否需要换行（基于参考形状的位置）
				const expectedNextX = ref.maxX + 50; // 预期的下一个X位置
				if (expectedNextX > maxLineWidth) {
					needsNewLine = true;
				}
			}
		}

			// 计算缩放比例 - 使用未移动标记进行缩放
		const targetHeight = WRITING_LINE_HEIGHT * 0.68; // 目标高度：51px（实际视图画布行高68px）
		
		// 过滤出未标记的形状（即没有moved标记的draw形状）
		const unmarkedShapes = drawShapes.filter(shape => !shape.meta?.moved);
		const shapesToScale = unmarkedShapes.filter(shape => newInkIds.includes(shape.id));
		
		if (shapesToScale.length > 0) {
			// 围绕内容中心进行真正的缩放，就像使用选择工具拖动边角一样
			scaleAllShapesToTargetHeight(editor, targetHeight);
		}
		
		console.log('缩放处理参数:', { 
			lineHeight: Math.round(lineHeight), 
			maxLineWidth: Math.round(maxLineWidth), 
			targetHeight: Math.round(targetHeight),
			nextTextY: Math.round(nextTextY),
			nextTextX: Math.round(nextTextX),
			selectedShapesCount: selectedShapes.length,
			hasSavedPosition: !!writingZonePositionRef.current
		});

		// 使用 editor.run() 进行事务性操作
		editor.run(() => {
			// 直接使用updateWritingZonePositionRef函数计算的位置，不进行额外的换行检查
			// 位置计算逻辑已完全由updateWritingZonePositionRef函数处理
			const newZoneX = nextTextX;
			const newZoneY = nextTextY;

			// 将形状移动到目标位置
			editor.updateShapes(
				selectedShapes.map(shape => {
					if (!shape || shape.type !== 'draw') return null;
					
					return {
						id: shape.id,
						type: 'draw' as const,
						x: newZoneX,
						y: newZoneY,
						meta: { ...(shape.meta || {}), moved: true } as any,
					};
				}).filter(Boolean)
			);

			// 如果检测到换行，触发背景模板延长
			if (needsNewLine) {
				console.log('检测到换行，触发背景模板延长');
				resizeWritingTemplateInvitingly(editor);
			}
			
			console.log('移动完成，基准位置已更新:', {
				oldPosition: { x: nextTextX, y: nextTextY },
				needsNewLine: needsNewLine
			});
		}, { name: 'auto-flow-writing-zone' } as any);
			
			// 内容转移到A区后，触发画布高度调整
			queueOrRunStorePostProcesses_current(editor);
		}, 100);

		// Note: For full flow layout with auto-wrap, additional logic would be needed to check width and move to new line if necessary.
		// This implementation appends to the bottom left of the container for simplicity.
	};

	// Set up pause-based detection for new ink in writing-zone
	// 使用停顿检测替代固定时间间隔
	React.useEffect(() => {
		// 检测是否为移动设备
		const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
		// 电脑设备使用4秒停顿检测，移动设备使用2秒停顿检测
		const pauseThreshold = isMobileDevice ? 150 : 300;
		
		const checkForPause = () => {
			const now = Date.now();
			const timeSinceLastStroke = now - lastStrokeTimeRef.current;
			
			// 如果停顿时间超过阈值，执行检测
			if (timeSinceLastStroke >= pauseThreshold) {
				detectAndProcessNewInk();
			}
		};
		
		// 使用较短的间隔来检查停顿状态（500ms）
		const interval = setInterval(checkForPause, 500);
		return () => clearInterval(interval);
	}, [currentTool]);



	if(!tlEditorSnapshot) return <></>
	verbose('EDITOR snapshot loaded')

	////////

	const defaultComponents = {
		Scribble: TldrawScribble,
		ShapeIndicators: TldrawShapeIndicators,
		CollaboratorScribble: TldrawScribble,
		SelectionForeground: TldrawSelectionForeground,
		Handles: TldrawHandles,
	}

	const handleMount = (_editor: Editor) => {
		const editor = tlEditorRef.current = _editor;
		setEmbedState(WritingEmbedState.editor);
		focusChildTldrawEditor(editorWrapperRefEl.current);
		preventTldrawCanvasesCausingObsidianGestures(editor);

		// 隐藏收费按钮
		const licenseButton = editor.getContainer().querySelector('.tl-watermark_SEE-LICENSE') as HTMLElement;
		if (licenseButton) {
			licenseButton.style.display = 'none';
		}

		resizeContainerIfEmbed(tlEditorRef.current);
		if(editorWrapperRefEl.current) {
			editorWrapperRefEl.current.style.opacity = '1';
		}

		updateWritingStoreIfNeeded(editor);
		
		// tldraw content setup
		adaptTldrawToObsidianThemeMode(editor);
		resizeWritingTemplateInvitingly(editor);
		resizeContainerIfEmbed(editor);	// Has an effect if the embed is new and started at 0
				
		// view set up
		if(props.embedded) {
			initWritingCamera(editor);
			// 移除嵌入式模式下的相机锁定，允许iOS设备上的缩放功能
			// editor.setCameraOptions({
			// 	isLocked: true,
			// })
		} else {
			initWritingCamera(editor, MENUBAR_HEIGHT_PX);
			cameraLimitsRef.current = initWritingCameraLimits(editor);
		}

		// 确保编辑器完全初始化后再设置工具状态监听器
		// 使用setTimeout替代editor.once('ready')，因为'ready'事件不存在于TLEventMap中
		let removeToolChangeListener: (() => void) | null = null;
		
		setTimeout(() => {
			// 仅在首次挂载时设置初始工具为'draw'，避免与用户工具切换冲突
			// 检查是否已经有工具状态，如果没有则设置默认工具
			const currentInstance = editor.store.get('instance:instance' as any);
			if (!currentInstance || !(currentInstance as any).props?.currentToolId) {
				editor.setCurrentTool('draw');
				setCurrentTool('draw');
			} else {
				// 如果已经有工具状态，同步到组件状态
				setCurrentTool((currentInstance as any).props.currentToolId);
			}
			
			// store加载完成后，记忆当前相机位置
			const currentCamera = editor.getCamera();
			cameraPositionRef.current = currentCamera;
			console.log('首次进入编辑器，store加载完成，记忆相机位置:', currentCamera);
			
			// 设置工具状态监听器，监听工具切换
			removeToolChangeListener = editor.store.listen((entry) => {
				// 直接检查instance记录的变化，不依赖added/updated计数
				const allRecords = [
					...Object.values(entry.changes.added),
					...Object.values(entry.changes.updated),
					...Object.values(entry.changes.removed)
				];
				
				for (const record of allRecords) {
					// 使用类型断言确保record具有正确的类型
					const typedRecord = record as any;
					if (typedRecord.typeName === 'instance' && typedRecord.props?.currentToolId) {
						// 工具状态已更新，同步到组件状态
						setCurrentTool(typedRecord.props.currentToolId);
						console.log('工具状态更新:', typedRecord.props.currentToolId);
						break;
					}
				}
			}, {
				source: 'user',
				scope: 'session' // 修复：改为session范围，确保能监听到工具切换
			});
		}, 0);

		// Runs on any USER caused change to the store, (Anything wrapped in silently change method doesn't call this).
		const removeUserActionListener = editor.store.listen((entry) => {

			const activity = getActivityType(entry);
			switch (activity) {
				case Activity.PointerMoved:
					// REVIEW: Consider whether things are being erased
					break;

				case Activity.CameraMovedAutomatically:
		case Activity.CameraMovedManually:
			if(cameraLimitsRef.current) restrictWritingCamera(editor, cameraLimitsRef.current);
			unstashStaleContent(editor);
			// 移动工具移动或缩放后更新基准位置
			updateWritingZonePositionRef(editor);
			break;

				case Activity.DrawingStarted:
					resetInputPostProcessTimers();
					stashStaleContent(editor);
					lastStrokeTimeRef.current = Date.now();
					break;
					
				case Activity.DrawingContinued:
					resetInputPostProcessTimers();
					lastStrokeTimeRef.current = Date.now();
					break;
					
				case Activity.DrawingCompleted:
					// 用户完成一笔，记录时间并启动短暂停顿检测
					lastStrokeTimeRef.current = Date.now();
					// 不立即触发画布高度调整，等待内容转移到A区后再调整
					// queueOrRunStorePostProcesses_current(editor); // 注释掉立即触发
					break;
					
				case Activity.DrawingErased:
			queueOrRunStorePostProcesses_current(editor);
			// 橡皮工具擦除后更新基准位置
			updateWritingZonePositionRef(editor);
			break;
						
					default:
						// 处理撤销、重做等操作，更新基准位置
						updateWritingZonePositionRef(editor);
			}

		}, {
			source: 'user',	// Local changes
			scope: 'all'	// Filters some things like camera movement changes. But Not sure it's locked down enough, so leaving as all.
		})

		const unmountActions = () => {
			// NOTE: This prevents the postProcessTimer completing when a new file is open and saving over that file.
			resetInputPostProcessTimers();
			removeUserActionListener();
			if (removeToolChangeListener) {
				removeToolChangeListener();
			}
		}

		if(props.saveControlsReference) {
			props.saveControlsReference({
				// save: () => completeSave(editor),
				saveAndHalt: async (): Promise<void> => {
					await completeSave(editor);
					unmountActions();	// Clean up immediately so nothing else occurs between this completeSave and a future unmount
				},
				resize: () => {
					const camera = editor.getCamera()
					const cameraY = camera.y;
					initWritingCamera(editor);
					editor.setCamera({x: camera.x, y: cameraY})
				}
			})
		}
		
		return () => {
			unmountActions();
		};
	}

	///////////////

	function resizeContainerIfEmbed (editor: Editor) {
		if (!props.embedded || !props.onResize) return;

		const embedBounds = editor.getViewportScreenBounds();
		const contentBounds = getWritingContainerBounds(editor);
		
		if (contentBounds) {
			const contentRatio = contentBounds.w / contentBounds.h;
			const newEmbedHeight = embedBounds.w / contentRatio;
			props.onResize(newEmbedHeight);
		}

	}

	const getTlEditor = (): Editor | undefined => {
		return tlEditorRef.current || undefined;
	};

	//////////////

	// 右键菜单选项
	const contextMenuOptions = getContextMenuOptions();

	return <>
		<div
			ref = {editorWrapperRefEl}
			className = {classNames([
				"ddc_ink_writing-editor",
			])}
			style={{
				height: '100%',
				position: 'relative',
				opacity: 0, // So it's invisible while it loads
			}}
			onContextMenu={handleContextMenu}
		>
			
				<Tldraw
					options = {tlOptions}
					shapeUtils = {[...defaultShapeUtils, ...MyCustomShapes]}
					tools = {[...defaultTools, ...defaultShapeTools]}
					// 移除initialState="draw"依赖，改为在handleMount中动态设置初始工具
					snapshot = {tlEditorSnapshot}
					// persistenceKey = {props.fileRef.path}

					// bindingUtils = {defaultBindingUtils}
					components = {defaultComponents}

					onMount = {handleMount}
					hideUi={true}

					// Prevent autoFocussing so it can be handled in the handleMount
					autoFocus = {false}
				>
				
            {/* 自定义右键菜单组件 */}
            {showContextMenu && (
              <CustomContextMenu
                x={contextMenuPosition.x}
                y={contextMenuPosition.y}
                options={contextMenuOptions}
                onClose={() => {
                  setShowContextMenu(false);
                  showContextMenuRef.current = false;
                  suppressSavesRef.current = false;
                }}
					editor={tlEditorRef.current}
				/>
			)}
			</Tldraw>
			{/* 放大书写区域 - 仅在draw状态下显示 */}
			{currentTool === 'draw' && (
				<div 
					className="writing-zone"
					ref={writingZoneRef}
				>
 				<ZoneMagnifier 
						editor={tlEditorRef.current}
						writingZoneRef={writingZoneRef}
						editorWrapperRef={editorWrapperRefEl}
					/>
				</div>
			)}
			<FingerBlocker getTlEditor={getTlEditor} wrapperRef={editorWrapperRefEl} />
			<PrimaryMenuBar>
				<WritingMenu
			getTlEditor = {getTlEditor}
			onStoreChange = {(tlEditor: Editor) => queueOrRunStorePostProcesses_current(tlEditor)}
			onToolChange = {(tool: string) => {
				// 更新currentTool状态，确保writing-zone正确显示/隐藏
				setCurrentTool(tool);
				
				// 处理增量保存和相机移动逻辑
				const ed = getTlEditor();
				if (ed) {
					// 使用requestAnimationFrame延迟保存，确保工具切换和快照恢复完成后再保存
					requestAnimationFrame(() => {
						incrementalSave(ed);
					});
				}
				
				// 当切换到draw工具时，移动相机到writing-zone区域
				if (tool === 'draw') {
					// 使用setTimeout确保writing-zone已经渲染完成
					setTimeout(() => {
						moveCameraToWritingZone();
					}, 0);
				} else {
					// 当切换到非draw工具时，先保存当前相机位置，然后恢复相机到正常状态
					setTimeout(() => {
						const editor = getTlEditor();
						if (editor) {
							// 保存当前相机位置
							const currentCamera = editor.getCamera();
							cameraPositionRef.current = currentCamera;
							console.log('保存相机位置:', currentCamera);
						}
						restoreNormalCamera();
					}, 0);
				}
			}}
			/>
				{props.embedded && props.extendedMenu && (
					<ExtendedWritingMenu
						onLockClick = { async () => {
							// REVIEW: Save immediately? incase it hasn't been saved yet
							if(props.closeEditor) props.closeEditor();
						}}
						menuOptions = {props.extendedMenu}
					/>
				)}
			</PrimaryMenuBar>

		</div>
	</>;


	// Helper functions
	///////////////////

    async function fetchFileData() {
        const svg = await props.writingFile.vault.read(props.writingFile);
        if(svg) {
            const svgSettings = extractInkJsonFromSvg(svg);
            if(svgSettings && svgSettings.tldraw) {
                const snapshot = prepareWritingSnapshot(svgSettings.tldraw as TLEditorSnapshot);
                setTlEditorSnapshot(snapshot);
            }
        }
    }

};

// 放大镜组件：放大相机所在位置的内容，仅在writing-zone区域内显示
interface ZoneMagnifierProps {
	editor: Editor | null;
	writingZoneRef: React.RefObject<HTMLDivElement>;
	editorWrapperRef: React.RefObject<HTMLDivElement>;
}

const ZoneMagnifier: React.FC<ZoneMagnifierProps> = ({ editor, writingZoneRef, editorWrapperRef }) => {
	const canvasRef = React.useRef<HTMLCanvasElement>(null);
	const animationRef = React.useRef<number>();

	React.useEffect(() => {
		if (!editor || !writingZoneRef.current || !editorWrapperRef.current) return;

		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// 设置canvas尺寸 - 基于writing-zone的尺寸
		const updateCanvasSize = () => {
			const zoneRect = writingZoneRef.current?.getBoundingClientRect();
			if (!zoneRect) return;

			const dpr = window.devicePixelRatio || 1;
			canvas.width = zoneRect.width * dpr;
			canvas.height = zoneRect.height * dpr;
			canvas.style.width = zoneRect.width + 'px';
			canvas.style.height = zoneRect.height + 'px';
			ctx.scale(dpr, dpr);
		};

		updateCanvasSize();

		// 绘制放大镜内容
		const drawMagnifier = () => {
			if (!editor || !writingZoneRef.current) return;

			const zoneRect = writingZoneRef.current.getBoundingClientRect();
			if (!zoneRect) return;

			// 清空canvas
			ctx.clearRect(0, 0, canvas.width, canvas.height);

			// 获取相机位置
			const camera = editor.getCamera();
			
			// 计算放大区域：相机所在位置的B区内容
			// B区位于writing-zone上方，包含书写容器和书写线条
			const magnifierScale = 1.5; // 放大倍数
			
			// 计算放大镜显示区域（C区）- 使用writing-zone的尺寸
			const magnifierWidth = zoneRect.width;
			const magnifierHeight = zoneRect.height;
			
			// 计算源区域（B区）
			const sourceWidth = magnifierWidth / magnifierScale;
			const sourceHeight = magnifierHeight / magnifierScale;
			
			// 正确的源区域中心点：相机视野中心在屏幕坐标系中的位置
		// 相机坐标(camera.x, camera.y)是页面坐标系，需要转换为屏幕坐标系
		const containerRect = editor.getContainer().getBoundingClientRect();
		
		// 计算相机视野中心在屏幕坐标系中的位置
		// 相机视野中心 = 相机位置 + 容器尺寸的一半 / 缩放比例
		const sourceCenterX = camera.x + containerRect.width / (2 * camera.z);
		const sourceCenterY = camera.y + containerRect.height / (2 * camera.z);
		
		// 计算源区域边界
		const sourceX = sourceCenterX - sourceWidth / 2;
		const sourceY = sourceCenterY - sourceHeight / 2;

		// 检查源区域尺寸是否有效
		if (sourceWidth <= 0 || sourceHeight <= 0) {
			console.warn('放大镜源区域尺寸无效:', { sourceWidth, sourceHeight });
			return;
		}

		// 直接使用tldraw的canvas进行放大
		try {
			// 获取tldraw的canvas元素
			const tldrawCanvas = editor.getContainer().querySelector('canvas');
			if (!tldrawCanvas) return;

			// 检查tldraw canvas的尺寸
			if (tldrawCanvas.width <= 0 || tldrawCanvas.height <= 0) {
				console.warn('Tldraw canvas尺寸无效:', { width: tldrawCanvas.width, height: tldrawCanvas.height });
				return;
			}

			// 创建临时canvas来绘制放大内容
			const tempCanvas = document.createElement('canvas');
			const tempCtx = tempCanvas.getContext('2d');
			if (!tempCtx) return;

			tempCanvas.width = sourceWidth;
			tempCanvas.height = sourceHeight;

			// 在临时canvas上绘制源区域
			tempCtx.drawImage(
				tldrawCanvas,
				sourceX, sourceY, sourceWidth, sourceHeight, // 源区域
				0, 0, sourceWidth, sourceHeight // 目标区域
			);

			// 将放大后的内容绘制到主canvas
			ctx.drawImage(
				tempCanvas,
				0, 0, sourceWidth, sourceHeight, // 源区域
				0, 0, magnifierWidth, magnifierHeight // 目标区域（放大）
			);
		} catch (error) {
			console.error('放大镜绘制错误:', error);
		}

			// 继续动画循环
			animationRef.current = requestAnimationFrame(drawMagnifier);
		};

		// 开始动画循环
		animationRef.current = requestAnimationFrame(drawMagnifier);

		// 监听窗口大小变化
		const handleResize = () => {
			updateCanvasSize();
		};

		window.addEventListener('resize', handleResize);

		return () => {
			if (animationRef.current) {
				cancelAnimationFrame(animationRef.current);
			}
			window.removeEventListener('resize', handleResize);
		};
	}, [editor, writingZoneRef, editorWrapperRef]);

	return (
		<canvas
			ref={canvasRef}
			style={{
				width: '100%',
				height: '100%',
				pointerEvents: 'none', // 不拦截鼠标事件
				zIndex: 10,
			}}
		/>
	);
};