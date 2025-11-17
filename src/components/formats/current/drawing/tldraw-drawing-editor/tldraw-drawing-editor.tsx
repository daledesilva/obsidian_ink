import './tldraw-drawing-editor.scss';
import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { Editor, getSnapshot, defaultShapeTools, defaultShapeUtils, defaultTools, loadSnapshot, TLEditorSnapshot, TLStoreSnapshot, Box, TldrawUi, TLUiComponents, Tldraw, TldrawEditor, copyAs } from 'tldraw';
import { addFileToLibrary } from "../../../../../commands/library";
import { importSvgToTldraw, parseSvgToShapes, parseSvgToShapesFallback } from "../../utils/importSvgToTldraw";
import { copyAsSvgWithMetadata, downloadSvgWithMetadata } from "../../utils/tldraw-metadata-export";

// 菜单选项类型定义
interface MenuOption {
  label: string;
  onClick: () => void;
  checked?: boolean;
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
    // 暂时注释掉自动隐藏逻辑，方便调试
    // setTimeout(onClose, 50);
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
        color: 'var(--color-text-0, white)',
        borderRadius: 'var(--tl-radius-3)',
        padding: '4px 0',
        boxShadow: 'var(--tl-shadow-3)',
        zIndex: 'var(--tl-layer-menus, 9999)',
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

import { FingerBlocker } from 'src/components/jsx-components/finger-blocker/finger-blocker';
import { ResizeHandle } from 'src/components/jsx-components/resize-handle/resize-handle';
import { getDrawingSvg, adaptTldrawToObsidianThemeMode, focusChildTldrawEditor, preventTldrawCanvasesCausingObsidianGestures, prepareDrawingSnapshot } from "src/components/formats/current/utils/tldraw-helpers";
import { buildDrawingFileData } from "src/components/formats/current/utils/build-file-data";
import { buildFileStr } from "src/components/formats/current/utils/buildFileStr";
import { getGlobals } from 'src/stores/global-store';
import { verbose } from 'src/logic/utils/log-to-console';
import { extractInkJsonFromSvg, autoConvertRegularSvgToInk } from 'src/logic/utils/extractInkJsonFromSvg';
import classNames from 'classnames';
import { DrawingEmbedState, editorActiveAtom_v2, embedStateAtom_v2 } from 'src/components/formats/current/drawing/drawing-embed/drawing-embed';
import { useAtomValue, useSetAtom } from 'jotai';
import { InkFileData } from 'src/components/formats/current/types/file-data';
import { PrimaryMenuBar } from 'src/components/jsx-components/primary-menu-bar/primary-menu-bar';
import { DrawingMenu } from 'src/components/jsx-components/drawing-menu/drawing-menu';
import ExtendedDrawingMenu from 'src/components/jsx-components/extended-drawing-menu/extended-drawing-menu';

// Defaults
const DRAW_SHORT_DELAY_MS = 500;
const DRAW_LONG_DELAY_MS = 3000;

// tldraw配置选项
const tlOptions = {
  defaultSvgPadding: 10,
  // 启用中文翻译支持
  i18n: {
    locale: 'zh-cn',
    // 提供默认翻译以避免网络请求错误
    loadTranslations: async () => ({
      'action.toggle-auto-pan': '切换自动平移',
      'action.toggle-auto-zoom': '切换自动缩放',
      'action.toggle-auto-none': '切换自动无',
      'action.toggle-mouse': '切换鼠标模式',
      'action.toggle-trackpad': '切换触控板模式',
      'action.enhanced-a11y-mode.menu': '增强辅助功能模式菜单',
      'action.enhanced-a11y-mode': '增强辅助功能模式',
      'assets.files.maximum-size': '文件最大尺寸',
      'menu.input-mode': '输入模式菜单',
      'style-panel.selected': '样式面板选中'
    })
  }
};

interface TldrawDrawingEditor_Props {
  fileRef: any;
  embedded: boolean;
  save: (drawingFileData: InkFileData) => void;
  tlEditorSnapshot?: TLEditorSnapshot;
  resizeEmbed?: (widthDiff: number, heightDiff: number) => void;
  closeEditor?: () => void;
  extendedMenu?: Array<any>;
  previewUri?: string;
  onReady?: () => void;
  onEditorReady?: (editor: Editor) => void; // 新增：传递编辑器实例的回调
  onEditorInstanceReady?: (editor: Editor) => void; // 新增：编辑器实例准备好的回调
  drawingFile?: any;
  saveControlsReference?: Function;
  components?: any;
  onSnapshotLoaded?: () => void;
  onStoreChange?: (snapshot: TLEditorSnapshot) => void;
  filePath?: string; // 用于异步加载SVG文件的路径
  plugin?: any; // 新增：插件实例，用于缓存管理
}

// 增强的快照验证函数
const isValidSnapshot = (snapshot: any): boolean => {
  if (snapshot === undefined || snapshot === null) return false;
  if (typeof snapshot !== 'object') return false;
  
  // 检查是否为TLEditorSnapshot格式（包含document.store）
  if (snapshot.document && snapshot.document.store) {
    const store = snapshot.document.store;
    if (store && typeof store === 'object') {
      // 放宽验证：只要store是对象就认为有效，让编辑器处理具体结构
      return true;
    }
  }
  
  // 检查是否为TLStoreSnapshot格式（直接包含schema和store）
  if (snapshot.schema && snapshot.store) {
    return true;
  }
  
  // 检查是否为TLStoreSnapshot格式（可能只有store属性）
  if (snapshot.store && snapshot.store.schema && snapshot.store.store) {
    return true;
  }
  
  // 检查是否包含session配置（转换后的快照可能只有session）
  if (snapshot.session && snapshot.session.currentPageId) {
    return true;
  }
  
  // 空快照也视为有效（编辑器会使用空状态）
  if (Object.keys(snapshot).length === 0) {
    return true;
  }
  
  // 放宽验证：任何包含document或session的对象都视为有效
  if (snapshot.document || snapshot.session) {
    return true;
  }
  
  // 检查是否为直接的store格式（包含schema）
  if (snapshot.schema && typeof snapshot.schema === 'object') {
    return true;
  }
  
  return false;
};

// 安全的快照获取函数
const safeGetSnapshot = (editor: Editor): TLEditorSnapshot | null => {
  try {
    if (!editor || !editor.store) return null;
    return getSnapshot(editor.store);
  } catch (error) {
    // Failed to get snapshot, use empty state
    return null;
  }
};

// 注意：文件数据解析已由drawing-view.tsx中的file-open事件处理
// 这里不再进行重复的文件解析，直接使用props.tlEditorSnapshot

// Wrapper to handle the embed state
export const TldrawDrawingEditorWrapper: React.FC<TldrawDrawingEditor_Props> = (props) => {
  const setEmbedState = useSetAtom(embedStateAtom_v2);
  const editorActive = useAtomValue(editorActiveAtom_v2);
  const currentEmbedState = useAtomValue(embedStateAtom_v2);
  const safeFileRef = props.fileRef || { path: '' };

  const hasProcessedLoadingEditorRef = useRef(false);
  const snapshotReadyRef = useRef(false);
  const editorInstanceRef = useRef<Editor | null>(null);
  const pendingSvgImportRef = useRef<string | null>(null);

  useEffect(() => {
    // 记录文件路径信息
    if (props.fileRef) {
      const filePath = props.fileRef?.path || '';
      
      // 检查缓存状态
      if (props.plugin && filePath) {
        const cachedSnapshot = props.plugin.getSvgCache(filePath);
        
        // 如果缓存中没有快照且是SVG文件，标记为待导入
        if (filePath.toLowerCase().endsWith('.svg')) {
          pendingSvgImportRef.current = filePath;
        }
      }
    }
    
    // 如果是非嵌入模式（全屏模式），直接设置为编辑状态
    if (!props.embedded) {
      setEmbedState(DrawingEmbedState.editor);
      return;
    }
    
    // 如果是嵌入模式，根据props.embedded设置状态
    if (props.embedded) {
      setEmbedState(DrawingEmbedState.editor);
    }
  }, [props.embedded, setEmbedState]);

  useEffect(() => {
    if (currentEmbedState === DrawingEmbedState.loadingEditor && !hasProcessedLoadingEditorRef.current) {
      
      let retries = 0;
      const maxRetries = 2; // 增加重试次数，给异步文件加载更多时间
      
      const checkSnapshotAndSwitch = async () => {
        if (retries >= maxRetries) {
          hasProcessedLoadingEditorRef.current = true;
          snapshotReadyRef.current = true;
          setEmbedState(DrawingEmbedState.editor);
          return;
        }
        
        retries++;
        
        // 文件数据解析已由drawing-view.tsx中的file-open事件处理
        // 直接检查props.tlEditorSnapshot是否可用
        if (isValidSnapshot(props.tlEditorSnapshot) || snapshotReadyRef.current) {
          
          // 记录快照来源
          if (props.fileRef && props.plugin) {
            const filePath = props.fileRef?.path || '';
            if (filePath) {
              const cachedSnapshot = props.plugin.getSvgCache(filePath);
              if (cachedSnapshot && props.tlEditorSnapshot === cachedSnapshot) {
                console.log(`[TldrawDrawingEditorWrapper] 使用缓存快照: ${filePath}`);
              } else if (props.tlEditorSnapshot) {
                console.log(`[TldrawDrawingEditorWrapper] 使用文件系统快照: ${filePath}`);
              }
            }
          }
          
          hasProcessedLoadingEditorRef.current = true;
          snapshotReadyRef.current = true;
          setEmbedState(DrawingEmbedState.editor);
          if (props.onSnapshotLoaded) props.onSnapshotLoaded();
        } else {
          // 检查是否是新建的SVG文件或空快照，如果是则跳过日志记录
          const isMinimalSvg = props.fileRef && props.fileRef.extension && props.fileRef.extension.toLowerCase() === 'svg';
          
          if (isMinimalSvg) {
            try {
              const filePath = props.fileRef?.path || '';
              if (!filePath) {
                // 文件路径为空，跳过检查
              } else if (props.fileRef && typeof props.fileRef === 'object' && props.fileRef.path) {
                const svgContent = await props.plugin.app.vault.read(props.fileRef);
                const hasTldrawMetadata = svgContent.includes('tldraw') || svgContent.includes('ink');
                
                if (!hasTldrawMetadata) {
                  // 常规SVG文件，静默切换到编辑器状态
                  hasProcessedLoadingEditorRef.current = true;
                  snapshotReadyRef.current = true;
                  setEmbedState(DrawingEmbedState.editor);
                  if (props.onSnapshotLoaded) props.onSnapshotLoaded();
                  return;
                }
              }
            } catch (error) {
              // 读取文件失败，静默处理
            }
          }
          
          // 如果不是新建SVG文件，记录检查失败日志
          if (!isMinimalSvg) {
            console.log('Snapshot not ready, checking if it\'s a regular SVG file...');
            
            // 记录当前快照状态
            if (props.fileRef) {
              const filePath = props.fileRef?.path || '未知路径';
              console.log(`快照检查失败，文件: ${filePath}`);
            }
          }
          
          setTimeout(checkSnapshotAndSwitch, 500); // 增加重试间隔
        }
      };

      setTimeout(() => {
        checkSnapshotAndSwitch();
      }, 100);
    }
    
    if (currentEmbedState !== DrawingEmbedState.loadingEditor) {
      hasProcessedLoadingEditorRef.current = false;
    }
  }, [currentEmbedState, setEmbedState, props]);

  useEffect(() => {
    if (editorInstanceRef.current && pendingSvgImportRef.current) {
      const filePath = pendingSvgImportRef.current;
      
      importSvgFileAfterEditorReady(filePath, editorInstanceRef.current)
        .then(() => {
          pendingSvgImportRef.current = null; // 清除待导入标记
          hasProcessedLoadingEditorRef.current = true;
          snapshotReadyRef.current = true;
          setEmbedState(DrawingEmbedState.editor);
          if (props.onSnapshotLoaded) props.onSnapshotLoaded();
        })
        .catch(error => {
          // 即使导入失败，也切换到编辑状态
          pendingSvgImportRef.current = null;
          hasProcessedLoadingEditorRef.current = true;
          snapshotReadyRef.current = true;
          setEmbedState(DrawingEmbedState.editor);
          if (props.onSnapshotLoaded) props.onSnapshotLoaded();
        });
    }
  }, [editorInstanceRef.current, setEmbedState, props.onSnapshotLoaded]);

  if (editorActive) {
    return <TldrawDrawingEditor {...props} onSnapshotLoaded={() => {
      snapshotReadyRef.current = true;
    }} onEditorInstanceReady={(editor) => {
      editorInstanceRef.current = editor;
      
      // 处理常规SVG文件导入
      if (props.fileRef && (props.fileRef as any).extension && (props.fileRef as any).extension.toLowerCase() === 'svg') {
        // 检查文件路径是否存在
        const filePath = props.fileRef?.path || '';
        if (!filePath) {
          return;
        }
        
        // 确保 fileRef 是一个有效的 TFile 对象
        if (props.fileRef && typeof props.fileRef === 'object' && props.fileRef.path) {
          // 检查是否是常规SVG文件（没有tldraw元数据）
          props.plugin.app.vault.read(props.fileRef).then((svgContent: string) => {
            const hasTldrawMetadata = svgContent.includes('tldraw') || svgContent.includes('ink');
            
            if (!hasTldrawMetadata) {
              importSvgFileAfterEditorReady(filePath, editor);
            }
          }).catch((error: any) => {
            // 读取SVG文件失败，静默处理
          });
        }
      }
    }} />;
  } else {
    return null;
  }
};

const TldrawDrawingEditor: React.FC<TldrawDrawingEditor_Props & { onSnapshotLoaded?: () => void }> = (props) => {
  // 简单的compact函数实现，过滤掉null和undefined值
  const compact = <T extends unknown>(arr: (T | null | undefined)[]): T[] => {
    return arr.filter((item): item is T => item != null);
  };
  
  const editorWrapperRefEl = useRef<HTMLDivElement>(null);
  const tlEditorRef = useRef<Editor | undefined>();
  const shortDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout | undefined>();
  const longDelayPostProcessTimeoutRef = useRef<NodeJS.Timeout | undefined>();
  
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const initialSnapshotRef = useRef<TLEditorSnapshot | null>(props.tlEditorSnapshot || null);
  const editorInstanceRef = useRef<Editor | null>(null);
  const currentEmbedState = useAtomValue(embedStateAtom_v2);
  const suppressSavesRef = useRef(false);
  const lastSnapshotRef = useRef<TLEditorSnapshot | null>(null);
  const showContextMenuRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const isSavingRef = useRef(false);

  // 注意：文件数据解析已由drawing-view.tsx中的file-open事件处理
  // 这里不再进行重复的文件解析，直接使用props.tlEditorSnapshot

  useEffect(() => {
    const register = () => {
      if (props.saveControlsReference && tlEditorRef.current) {
        const controls = {
          save: () => completeSave(tlEditorRef.current!),
          saveAndHalt: async () => {
            await completeSave(tlEditorRef.current!);
            queueOrRunStorePostProcesses(tlEditorRef.current!);
          },
          focusCanvas: () => {
            if (editorWrapperRefEl.current) {
              focusChildTldrawEditor(editorWrapperRefEl.current);
            }
          }
        };
        props.saveControlsReference(controls);
      }
    };
    
    const timer = setTimeout(register, 100);
    return () => clearTimeout(timer);
  }, [props.saveControlsReference]);

  useEffect(() => {
    const snapshot = props.tlEditorSnapshot;
    if (isValidSnapshot(snapshot)) {
      initialSnapshotRef.current = snapshot || null;
      lastSnapshotRef.current = snapshot || null;
      if (props.onSnapshotLoaded) props.onSnapshotLoaded();
    }
  }, [props.tlEditorSnapshot, props.onSnapshotLoaded]);

  const defaultComponents = {
    ...props.components,
  }

  const handleMount = useCallback((editor: Editor) => {
    // 确保每次挂载都创建新的编辑器实例引用，避免状态缓存问题
    tlEditorRef.current = editor;
    editorInstanceRef.current = editor;
    
    // 调用编辑器实例准备好的回调
    if (props.onEditorInstanceReady) {
      props.onEditorInstanceReady(editor);
    }
    
    // 重置快照引用，确保每个文件都有独立的快照状态
    initialSnapshotRef.current = props.tlEditorSnapshot || null;
    lastSnapshotRef.current = props.tlEditorSnapshot || null;
    
    const licenseButton = editor.getContainer().querySelector('.tl-watermark_SEE-LICENSE[data-unlicensed="true"] > button') as HTMLElement;
    if (licenseButton) {
      licenseButton.style.display = 'none';
    }
    
    let effectiveSnapshot = initialSnapshotRef.current;
    let hasLoadedSnapshot = false;
    
    // 文件数据解析已由drawing-view.tsx中的file-open事件处理
    // 这里不再进行重复的文件解析，直接使用props.tlEditorSnapshot
    // 如果props.tlEditorSnapshot不可用，则使用空状态
    
    // 同步处理现有的快照逻辑（只有在异步加载没有成功时才执行）
    if (!hasLoadedSnapshot) {
      if (!isValidSnapshot(effectiveSnapshot)) {
        effectiveSnapshot = null;
      } else {
        if (effectiveSnapshot) {
          try {
            // 使用官方的loadSnapshot函数，直接传递TLEditorSnapshot
            // loadSnapshot函数接受Partial<TLEditorSnapshot>参数
            loadSnapshot(editor.store, effectiveSnapshot);
            if (props.onSnapshotLoaded) props.onSnapshotLoaded();
          } catch (error) {
            // 如果快照加载失败，尝试使用编辑器当前状态
          }
        }
      }
    }
    
    adaptTldrawToObsidianThemeMode(editor);
    
    const container = editor.getContainer();
    
    // 只在自定义UI模式下设置右键菜单相关逻辑
    if (isCustomUIMode) {
      // 只在自定义UI模式下定义handleContextMenu函数
      const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        
        const rect = editor.getContainer().getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        setContextMenuPosition({ x, y });
        setShowContextMenu(true);
        showContextMenuRef.current = true;
        
        // 简化保存抑制逻辑，避免复杂的定时器导致状态问题
        suppressSavesRef.current = true;
      };
      
      // 只在自定义UI模式下定义handleClick函数
      const handleClick = (e: MouseEvent) => {
        if (showContextMenuRef.current) {
          // 检查点击目标是否在右键菜单内部
          const contextMenuEl = document.querySelector('.tlui-menu');
          if (contextMenuEl && contextMenuEl.contains(e.target as Node)) {
            // 如果点击在菜单内部，不关闭菜单，让菜单项处理点击事件
            return;
          }
          
          // 简化逻辑：点击菜单外部时立即关闭菜单并恢复保存
          setShowContextMenu(false);
          showContextMenuRef.current = false;
          suppressSavesRef.current = false;
        }
      };
      
      // 定义handleContextMenuSafe函数在外部作用域，确保cleanup函数可以访问
      const handleContextMenuSafe = (e: MouseEvent) => {
        handleContextMenu(e);
      };
      
      // 添加contextmenu事件监听器
      container.addEventListener('contextmenu', handleContextMenuSafe, { passive: false });
      
      // 添加click事件监听器（用于关闭右键菜单）
      container.addEventListener('click', handleClick, { passive: true });
      
      // 在自定义UI模式下启用preventTldrawCanvasesCausingObsidianGestures
      const cleanupTldrawGestures = preventTldrawCanvasesCausingObsidianGestures(editor);
      
      // 添加清理函数，在组件卸载时移除这些特定于自定义UI模式的监听器
      const originalCleanup = cleanupRef.current;
      cleanupRef.current = () => {
        if (originalCleanup) originalCleanup();
        container.removeEventListener('contextmenu', handleContextMenuSafe);
        container.removeEventListener('click', handleClick);
        if (cleanupTldrawGestures) cleanupTldrawGestures();
      };
    } else {
      // 官方UI模式：不设置自定义右键菜单，让官方UI处理
      // 只添加基本的点击事件监听器来清理可能的状态
      const handleClickBasic = (e: MouseEvent) => {
        if (showContextMenuRef.current) {
          setShowContextMenu(false);
          showContextMenuRef.current = false;
          suppressSavesRef.current = false;
        }
      };
      
      container.addEventListener('click', handleClickBasic, { passive: true });
        
        // 在官方UI模式下，我们需要一个修改版的preventTldrawCanvasesCausingObsidianGestures函数
        // 这个版本不应该阻止右键菜单
        const preventTldrawCanvasesCausingObsidianGesturesOfficial = (tlEditor: Editor) => {
          const tlContainer = tlEditor.getContainer();
          const tlCanvas = tlContainer.getElementsByClassName('tl-canvas')[0] as HTMLDivElement;
          if (!tlCanvas) return () => {};
          
          // 设置touch-action以支持缩放
          tlCanvas.style.touchAction = 'auto';
          
          // 跟踪当前触摸点数量
          let touchCount = 0;
          
          // 触摸事件处理函数
          const handleTouchStart = (e: TouchEvent) => {
            touchCount = e.touches.length;
          };
          
          const handleTouchMove = (e: TouchEvent) => {
            // 更新当前触摸点数量
            touchCount = e.touches.length;
            
            // 单指触摸：阻止冒泡和默认行为，防止触发Obsidian的滚动
            if (touchCount === 1) {
              e.stopPropagation();
              e.preventDefault();
            }
          };
          
          const handleTouchEnd = (e: TouchEvent) => {
            touchCount = e.touches.length;
          };
          
          const handleTouchCancel = (e: TouchEvent) => {
            touchCount = e.touches.length;
          };
          
          // 添加事件监听器
          tlCanvas.addEventListener('touchstart', handleTouchStart, { passive: true });
          tlCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });
          tlCanvas.addEventListener('touchend', handleTouchEnd, { passive: true });
          tlCanvas.addEventListener('touchcancel', handleTouchCancel, { passive: true });
          
          // 返回清理函数
          return () => {
            tlCanvas.removeEventListener('touchstart', handleTouchStart);
            tlCanvas.removeEventListener('touchmove', handleTouchMove);
            tlCanvas.removeEventListener('touchend', handleTouchEnd);
            tlCanvas.removeEventListener('touchcancel', handleTouchCancel);
          };
        };
        
        const cleanupTldrawGestures = preventTldrawCanvasesCausingObsidianGesturesOfficial(editor);
        
        // 添加清理函数，在组件卸载时移除这些特定于官方UI模式的监听器
        const originalCleanup = cleanupRef.current;
        cleanupRef.current = () => {
          if (originalCleanup) originalCleanup();
          container.removeEventListener('click', handleClickBasic);
          if (cleanupTldrawGestures) cleanupTldrawGestures();
        };
    }
    
    focusChildTldrawEditor(editorWrapperRefEl.current);
    
    setTimeout(() => {
      if (editorWrapperRefEl.current) {
        editorWrapperRefEl.current.style.opacity = '1';
      }
      if (props.onReady) props.onReady();
      if (props.onEditorReady) props.onEditorReady(editor);
      
      // 编辑器初始化完成后，检查是否需要导入SVG文件
      if (props.filePath && editor) {
        // 只有在文件是常规SVG且没有tldraw元数据时才执行导入
        // 避免对tldraw格式文件重复导入
        checkAndImportSvgIfNeeded(props.filePath, editor);
      }
    }, 100);
    
    // 添加快捷键处理
    const handleKeyDown = (e: KeyboardEvent) => {
      const editor = tlEditorRef.current;
      if (!editor) return;
      
      // 检查是否在编辑文本，如果是则跳过快捷键处理
      if (editor.getEditingShapeId() !== null) return;
      
      // 检查是否显示右键菜单，如果是则跳过快捷键处理以避免冲突
      if (showContextMenuRef.current) return;
      
      // 检查是否按下了Ctrl或Cmd键
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'c':
            // Ctrl+C 或 Cmd+C 复制
            e.preventDefault();
            helpers.copy();
            break;
          case 'x':
            // Ctrl+X 或 Cmd+X 剪切
            e.preventDefault();
            helpers.cut();
            break;
          case 'v':
            // Ctrl+V 或 Cmd+V 粘贴
            e.preventDefault();
            helpers.paste();
            break;
          case 'd':
            // Ctrl+D 或 Cmd+D 复制（重复）
            e.preventDefault();
            helpers.duplicate();
            break;
          case 'a':
            // Ctrl+A 或 Cmd+A 全选
            e.preventDefault();
            editor.selectAll();
            break;
          case 'z':
            // Ctrl+Z 或 Cmd+Z 撤销
            if (e.shiftKey) {
              // Ctrl+Shift+Z 或 Cmd+Shift+Z 重做
              e.preventDefault();
              editor.redo();
            } else {
              // Ctrl+Z 或 Cmd+Z 撤销
              e.preventDefault();
              editor.undo();
            }
            break;
          case 'shift':
            // Ctrl+Shift+C 或 Cmd+Shift+C 复制为SVG
            if (e.key.toLowerCase() === 'c' && e.shiftKey) {
              e.preventDefault();
              const selectedShapeIds = editor.getSelectedShapeIds();
              if (selectedShapeIds.length === 0) return;
              copyAs(editor, selectedShapeIds, { format: 'svg' });
            }
            break;
        }
      }
      
      // 删除键处理
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const selectedShapeIds = editor.getSelectedShapeIds();
        if (selectedShapeIds.length > 0) {
          editor.deleteShapes(selectedShapeIds);
        }
      }
    };
    
    // 添加键盘事件监听器
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      // 调用存储在cleanupRef中的特定于UI模式的清理函数
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      
      // 移除键盘事件监听器
      document.removeEventListener('keydown', handleKeyDown);
      
      // 重置定时器
      resetInputPostProcessTimers();
    };
  }, [props.onReady, props.onSnapshotLoaded]);

  const incrementalSave = async (editor: Editor) => {
    if (isSavingRef.current || suppressSavesRef.current) {
      return;
    }
    
    verbose('incrementalSave');
    try {
      isSavingRef.current = true;
      const tlEditorSnapshot = safeGetSnapshot(editor);
      
      if (!tlEditorSnapshot) {
        return;
      }
      
      if (lastSnapshotRef.current && JSON.stringify(lastSnapshotRef.current) === JSON.stringify(tlEditorSnapshot)) {
        return;
      }
      
      lastSnapshotRef.current = tlEditorSnapshot;
      
      const drawingFileData = buildDrawingFileData({
        tlEditorSnapshot: tlEditorSnapshot,
      });
      props.save(drawingFileData);
    } catch (error) {
      console.error('Failed to save incrementally:', error);
    } finally {
      isSavingRef.current = false;
    }
  };

  const completeSave = async (editor: Editor): Promise<void> => {
    if (isSavingRef.current || suppressSavesRef.current) {
      return;
    }
    
    verbose('completeSave');
    try {
      isSavingRef.current = true;
      const tlEditorSnapshot = safeGetSnapshot(editor);
      if (!tlEditorSnapshot) {
        return;
      }

      const { plugin } = getGlobals();
      const svgObj = await getDrawingSvg(editor, {
        drawingBackgroundWhenLocked: plugin.settings.drawingBackgroundWhenLocked
      });

      const pageData = buildDrawingFileData({
        tlEditorSnapshot,
        svgString: svgObj?.svg,
      });
      props.save(pageData);
      
      lastSnapshotRef.current = tlEditorSnapshot;
    } catch (error) {
      console.error('Failed to save completely:', error);
    } finally {
      isSavingRef.current = false;
    }
  };

  // 定义复制、剪切、粘贴辅助函数
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
                let tldrawData: any;
                try {
                  tldrawData = JSON.parse(tldrawElement.textContent || '{}');
                } catch (error) {
                  console.warn('解析tldraw数据失败:', error);
                  return;
                }
                if (tldrawData.type === 'application/tldraw' && tldrawData.kind === 'content') {
                  // 解压缩数据
                  let decompressedData: any;
                  try {
                    decompressedData = JSON.parse(require('lz-string').decompressFromBase64(tldrawData.data.otherCompressed));
                  } catch (error) {
                    console.warn('解压缩tldraw数据失败:', error);
                    return;
                  }
                  
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
            
            // 处理图片粘贴
            if (type.startsWith('image/')) {
              try {
                const blob = await item.getType(type);
                
                // 创建临时URL
                const imageUrl = URL.createObjectURL(blob);
                
                // 创建图片元素获取尺寸
                const img = new Image();
                img.onload = async () => {
                  try {
                    // 创建图片资源
                    const assetId = `asset:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    
                    // 将图片转换为base64
                    const reader = new FileReader();
                    reader.onload = (e) => {
                      const base64Data = e.target?.result as string;
                      
                      // 创建图片资源
                      editor.createAssets([{
                        id: assetId as any, // 使用类型断言解决TLAssetId类型问题
                        typeName: 'asset',
                        type: 'image',
                        props: {
                          name: 'pasted-image',
                          src: base64Data,
                          w: img.width,
                          h: img.height,
                          mimeType: blob.type,
                          isAnimated: false,
                        },
                        meta: {},
                      }]);
                      
                      // 创建图片形状
                      editor.createShapes([{
                        type: 'image',
                        x: point.x,
                        y: point.y,
                        props: {
                          w: img.width,
                          h: img.height,
                          assetId: assetId,
                        },
                      }]);
                      
                      // 清理临时URL
                      URL.revokeObjectURL(imageUrl);
                    };
                    
                    reader.readAsDataURL(blob);
                  } catch (error) {
            // 清理临时URL
            URL.revokeObjectURL(imageUrl);
          }
                };
                img.onerror = () => {
                  console.error('Failed to load image from clipboard');
                  URL.revokeObjectURL(imageUrl);
                };
                img.src = imageUrl;
                
                return;
              } catch (imageError) {
                // Failed to paste image, trying other formats
              }
            }
          }
        }
        
        // 如果没有找到tldraw数据或图片，尝试粘贴为文本
        try {
          const textBlob = await clipboardItems[0].getType('text/plain');
          const text = await textBlob.text();
          if (text.trim()) {
            editor.createShapes([{
              type: 'text',
              x: point.x,
              y: point.y,
              props: {
                text: text,
                color: 'black',
                size: 'm',
                font: 'draw',
                align: 'middle',
              },
            }]);
          }
        } catch (textError) {
          // Failed to paste as text
        }
      } catch (error) {
        // Failed to paste
      }
    },
    duplicate: () => {
      const editor = tlEditorRef.current;
      if (!editor) return;
      
      const selectedShapeIds = editor.getSelectedShapeIds();
      if (selectedShapeIds.length === 0) return;
      
      // 使用Tldraw的复制功能
      editor.markHistoryStoppingPoint('duplicate');
      editor.duplicateShapes(selectedShapeIds);
    },
  }), []);

  const getContextMenuOptions = () => {
    const editor = tlEditorRef.current;
    if (!editor) return [];
    
    const createMenuItemHandler = (action: () => void, delay: number = 0) => {
      return () => {
        suppressSavesRef.current = true;
        if (window.menuClickSaveTimeout) {
          clearTimeout(window.menuClickSaveTimeout);
        }
        window.menuClickSaveTimeout = setTimeout(() => {
          suppressSavesRef.current = false;
        }, delay);
        action();
      };
    };
    
    // 透明背景状态
    const isTransparentBg = !editor.getInstanceState().exportBackground;
    
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
          label: '复制为 SVG', 
          onClick: createMenuItemHandler(async () => {
            const selectedShapeIds = editor.getSelectedShapeIds();
            if (selectedShapeIds.length === 0) return;
            
            try {
              // 使用Tldraw的copyAs函数
              await copyAs(editor, selectedShapeIds, { format: 'svg' });
            } catch (error) {
              // Failed to copy as SVG
            }
          }, 2000)
        },
        { 
          label: '复制为 PNG', 
          onClick: createMenuItemHandler(async () => {
            const selectedShapeIds = editor.getSelectedShapeIds();
            if (selectedShapeIds.length === 0) return;
            
            try {
              // 使用Tldraw的copyAs函数
              await copyAs(editor, selectedShapeIds, { format: 'png' });
            } catch (error) {
              // Failed to copy as PNG
            }
          }, 2000)
        },
      { 
        label: '透明', 
        onClick: createMenuItemHandler(() => {
          editor.updateInstanceState({ exportBackground: !editor.getInstanceState().exportBackground });
        }),
        checked: isTransparentBg
      }
    ];
    
    // 导出为菜单选项组
    const exportAsMenuOptions = [
      { 
        label: '导出为 SVG', 
        onClick: createMenuItemHandler(async () => {
          // 导出纯SVG格式
          const editor = getTlEditor();
          if (!editor) return;
          
          try {
            await downloadSvgWithMetadata(editor);
          } catch (error) {
            // 静默处理错误
          }
        }, 2000)
      },
      { 
        label: '导出为 PNG', 
        onClick: createMenuItemHandler(async () => {
          const svgObj = await getDrawingSvg(editor);
          if (svgObj?.svg) {
            // 将SVG转换为PNG
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            const svgBlob = new Blob([svgObj.svg], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(svgBlob);
            
            img.onload = () => {
              canvas.width = img.width;
              canvas.height = img.height;
              ctx?.drawImage(img, 0, 0);
              
              canvas.toBlob((blob) => {
                if (blob) {
                  const pngUrl = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = pngUrl;
                  a.download = 'drawing.png';
                  a.click();
                  URL.revokeObjectURL(pngUrl);
                }
                URL.revokeObjectURL(url);
              }, 'image/png');
            };
            
            img.src = url;
          }
        }, 2000)
      },
      { 
        label: '透明', 
        onClick: createMenuItemHandler(() => {
          editor.updateInstanceState({ exportBackground: !editor.getInstanceState().exportBackground });
        }),
        checked: isTransparentBg
      }
    ];
    
    // 导入SVG菜单项
    const importSvgOption = {
      label: '导入SVG',
      onClick: createMenuItemHandler(async () => {
        const globals = getGlobals();
        const plugin = globals.plugin;
        
        // 创建文件选择输入框
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.svg';
        input.style.display = 'none';
        
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          
          try {
            // 读取SVG文件内容
            const svgContent = await file.text();
            
            // 导入SVG到tldraw编辑器
            if (editor && importSvgToTldraw) {
              // 使用画布中心位置导入SVG
              let offsetX = 100;
              let offsetY = 100;
              
              try {
                const viewportPageBounds = editor.getViewportPageBounds();
                if (viewportPageBounds) {
                  offsetX = viewportPageBounds.center.x;
                  offsetY = viewportPageBounds.center.y;
                }
              } catch (error) {
                // 使用默认位置
              }
              
              const { shapes, imageData } = parseSvgToShapes(svgContent);
              const success = importSvgToTldraw(editor, shapes, imageData, offsetX, offsetY);
            }
          } catch (error) {
            // Fail silently
          }
          
          // 清理输入框
          document.body.removeChild(input);
        };
        
        // 触发文件选择
        document.body.appendChild(input);
        input.click();
      }, 1000)
    };
    
    // 添加到素材库菜单项
    const addToLibraryOption = {
      label: '添加到素材库',
      onClick: createMenuItemHandler(async () => {
        const globals = getGlobals();
        const plugin = globals.plugin;
        
        // 获取当前文件路径
        const fileRef = props.fileRef;
        const filePath = fileRef?.path || '';
        
        if (!fileRef || !filePath) {
          return;
        }
        
        try {
          await addFileToLibrary(plugin, filePath);
        } catch (error) {
          // 静默处理错误
        }
      }, 1000)
    };
    
    if (editor.getSelectedShapeIds().length > 0) {
      return [
        ...baseMenuOptions,
        { label: '重复 Ctrl+D', onClick: createMenuItemHandler(() => helpers.duplicate()) },
        { label: '复制为', onClick: () => {}, submenu: copyAsMenuOptions },
        { label: '导出为', onClick: () => {}, submenu: exportAsMenuOptions },
        importSvgOption,
        addToLibraryOption
      ];
    } else {
      return [
        ...baseMenuOptions,
        { label: '导出为', onClick: () => {}, submenu: exportAsMenuOptions },
        importSvgOption,
        addToLibraryOption
      ];
    }
  };

  const contextMenuOptions = getContextMenuOptions();

  const recordSnapshotForContextMenu = (editor: Editor) => {
    if (!editor || !editor.store) return;
    const snapshot = safeGetSnapshot(editor);
    if (snapshot) {
      lastSnapshotRef.current = snapshot;
    }
  };

  const queueOrRunStorePostProcesses = (editor: Editor) => {
    if (!editor || !editor.store) return;
    resetInputPostProcessTimers();
    const snapshot = safeGetSnapshot(editor);
    if (snapshot) {
      lastSnapshotRef.current = snapshot;
    }
  };

  const resetShortPostProcessTimer = () => {
    clearTimeout(shortDelayPostProcessTimeoutRef.current);
  };

  const resetLongPostProcessTimer = () => {
    clearTimeout(longDelayPostProcessTimeoutRef.current);
  };

  const resetInputPostProcessTimers = () => {
    resetShortPostProcessTimer();
    resetLongPostProcessTimer();
  };

  const getTlEditor = (): Editor | undefined => {
    return tlEditorRef.current;
  };

  const customExtendedMenu = [
    {
      text: 'Grid on/off',
      action: () => {
        const editor = getTlEditor();
        if (editor) {
          editor.updateInstanceState({ isGridMode: !editor.getInstanceState().isGridMode })
        }
      }
    },
    {
      text: 'Toggle UI Mode',
      action: async () => {
        const globals = getGlobals();
        const currentMode = globals.plugin.settings.uiMode;
        const newMode = currentMode === 'custom' ? 'official' : 'custom';
        globals.plugin.settings.uiMode = newMode;
        
        // 保存当前编辑状态，以便热加载后恢复
        const wasInEditMode = true; // 假设当前在编辑模式
        
        await globals.plugin.saveSettings();
        
        // 执行插件热加载，让UI模式切换立即生效
        try {
          const pluginId = 'ink';
          
          // 使用类型断言和安全的插件热加载方式
          const appWithPlugins = globals.plugin.app as any;
          if (appWithPlugins.plugins && 
              typeof appWithPlugins.plugins.disablePlugin === 'function' && 
              typeof appWithPlugins.plugins.enablePlugin === 'function') {
            
            // 先禁用插件
            await appWithPlugins.plugins.disablePlugin(pluginId);
            // 再启用插件
            await appWithPlugins.plugins.enablePlugin(pluginId);
            
            // 插件重新加载后，自动切换到编辑状态
            // 这里需要等待插件完全加载后再执行状态切换
            setTimeout(() => {
              // 查找并触发编辑模式切换
              const embedElement = document.querySelector('.ddc_ink_drawing-embed');
              if (embedElement) {
                // 模拟点击预览区域来切换到编辑模式
                const previewElement = embedElement.querySelector('.ddc_ink_resize-container') as HTMLElement;
                if (previewElement) {
                  // 使用更安全的点击方法
                  previewElement.dispatchEvent(new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                  }));
                }
              }
            }, 1000); // 等待1秒确保插件完全加载
          } else {
            // UI mode will take effect on next editor open
          }
        } catch (error) {
          // Fail silently
        }
      }
    },
    {
      text: 'Import SVG',
      action: async () => {
        const editor = getTlEditor();
        if (!editor) return;
        
        // 创建文件选择输入框
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.svg';
        input.style.display = 'none';
        
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          
          try {
            // 读取SVG文件内容
            const svgContent = await file.text();
            
            // 导入SVG到tldraw编辑器
            if (editor && importSvgToTldraw) {
              // 动态计算导入位置：对于常规SVG，使用固定位置；对于其他情况使用画布中心
              let offsetX = 100;
              let offsetY = 100;
              
              // 检查是否为常规SVG，如果是则使用固定位置保持相对位置
              const isRegularSvg = !svgContent.includes('tldraw');
              
              if (isRegularSvg) {
                // 对于常规SVG，使用固定位置以保持笔划的相对位置
              } else {
                // 对于其他SVG（如tldraw格式），使用画布中心位置
                try {
                  const viewportPageBounds = editor.getViewportPageBounds();
                  if (viewportPageBounds) {
                    offsetX = viewportPageBounds.center.x;
                    offsetY = viewportPageBounds.center.y;
                  }
                } catch (error) {
                  // 使用默认位置
                }
              }
              const { shapes, imageData } = parseSvgToShapes(svgContent);
              const success = importSvgToTldraw(editor, shapes, imageData, offsetX, offsetY);
            }
          } catch (error) {
            // 静默处理错误
          }
          
          // 清理输入框
          document.body.removeChild(input);
        };
        
        // 触发文件选择
        document.body.appendChild(input);
        input.click();
      }
    },
    {
      text: 'Export SVG',
      action: async () => {
        const editor = getTlEditor();
        if (!editor) return;
        
        try {
          // 使用与退出编辑器时相同的保存逻辑，导出带有元数据的ink格式
          // 支持框选元素局部导出：有框选则导出框选元素，无框选则导出全部
          const tlEditorSnapshot = safeGetSnapshot(editor);
          if (!tlEditorSnapshot) {
            return;
          }

          const { plugin } = getGlobals();
          
          // 获取当前选择的形状ID，用于局部导出
          const selectedShapeIds = editor.getSelectedShapeIds();
          
          // 根据是否有框选元素决定导出范围
          let svgObj;
          if (selectedShapeIds.length > 0) {
            // 有框选元素：仅导出框选元素
            svgObj = await getDrawingSvg(editor, {
              drawingBackgroundWhenLocked: plugin.settings.drawingBackgroundWhenLocked,
              shapes: selectedShapeIds
            });
          } else {
            // 无框选元素：导出全部元素
            svgObj = await getDrawingSvg(editor, {
              drawingBackgroundWhenLocked: plugin.settings.drawingBackgroundWhenLocked
            });
          }

          // 构建与退出编辑器时相同的文件数据
          const pageData = buildDrawingFileData({
            tlEditorSnapshot,
            svgString: svgObj?.svg,
          });

          // 使用buildFileStr构建完整的SVG文件内容
          const svgContent = buildFileStr(pageData);
          
          // 下载SVG文件
          const blob = new Blob([svgContent], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'drawing.svg';
          a.click();
          URL.revokeObjectURL(url);
          
        } catch (error) {
          // Fail silently
        }
      }
    },

    ...(props.extendedMenu || []),
  ];



  // 获取设置以决定显示哪个UI
  const globals = getGlobals();
  const settings = globals.plugin.settings;
  // 将UI模式判断移到组件顶层，确保在useEffect中可以正确引用
  const isCustomUIMode = settings.uiMode === 'custom';
  const showCustomUI = isCustomUIMode;
  const showOfficialUI = settings.uiMode === 'official';

  // 使用Tldraw作为根容器，采用MD文件中的简洁实现方式
  const filePath = props.fileRef?.path || '';
  const tldrawKey = filePath || 'default-drawing-key';
  const persistenceKey = `tldraw:${filePath || 'default'}`;

  // 根据 settings.showCustomUI 决定是否隐藏所有官方 UI
  const isHideUiEnabled = settings.uiMode === 'custom';

  // 使用useMemo创建组件配置对象，仅在官方UI模式下生效
  const componentsConfig = useMemo(() => {
    const config: TLUiComponents = {};

    // 仅当不处于自定义UI模式时（即处于官方UI模式），才根据设置面板的开关来决定显示或隐藏各个组件
    // 如果 settings.uiMode 为 'custom'，则 isHideUiEnabled 为 true，所有官方UI都会被 Tldraw 的 hideUi 属性隐藏
    if (settings.uiMode === 'official') {
      // 如果 settings.officialUIComponents 中的对应属性为 false，则将其设置为 null (隐藏)
      // 否则 (为 true)，不设置该属性，让 tldraw 渲染默认组件
      if (!settings.officialUIComponents.toolbar) config.Toolbar = null;
      if (!settings.officialUIComponents.menuBar) config.MainMenu = null;
      if (!settings.officialUIComponents.pageMenu) config.PageMenu = null;
      if (!settings.officialUIComponents.stylePanel) config.StylePanel = null;
      if (!settings.officialUIComponents.navigationPanel) config.NavigationPanel = null;
      if (!settings.officialUIComponents.zoomMenu) config.ZoomMenu = null;
      if (!settings.officialUIComponents.helperButtons) config.HelperButtons = null;

      // 始终隐藏分享面板（水印按钮），无论设置如何
      config.SharePanel = null;
    }

    return config;
  }, [settings]); // 依赖于 settings 状态，当 settings 更新时重新计算

  // 统一使用Tldraw组件的hideUi和components属性控制UI显示，避免使用TldrawUi组件
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* 使用Tldraw作为根容器，通过hideUi和components属性完全控制UI显示 */}
      <Tldraw
        key={tldrawKey}
        snapshot={initialSnapshotRef.current || undefined}
        persistenceKey={persistenceKey}
        shapeUtils={defaultShapeUtils}
        tools={[...defaultTools, ...defaultShapeTools]}
        onMount={handleMount}
        hideUi={isHideUiEnabled} // 根据 isHideUiEnabled 动态隐藏所有官方UI
        components={componentsConfig} // 在官方UI模式下生效，精细控制子组件
        initialState="draw" // 设置初始状态为画笔工具
      >
        {/* 自定义UI模式：渲染自定义菜单组件 */}
        {showCustomUI && (
          <>
            {/* 外层容器：允许事件穿透到画布 */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 'var(--tl-layer-header-footer)',
              pointerEvents: 'none', // ✅ 允许事件穿透到画布
            }}>
              {/* 内层菜单：只有菜单区域可交互 */}
              <div style={{ 
                pointerEvents: 'auto', // ✅ 菜单按钮可以点击
                width: 'fit-content', // 只占用必要宽度
                margin: '0 auto', // 居中
              }}>
                <PrimaryMenuBar>
                  <DrawingMenu
                    getTlEditor={getTlEditor}
                    onStoreChange={() => {
                      // 空函数，不执行保存
                    }}
                  />
                  {props.extendedMenu && (
                    <ExtendedDrawingMenu
                      onLockClick={async () => {
                        const editor = tlEditorRef.current;
                        if (editor) {
                          await completeSave(editor);
                        }
                        if (props.closeEditor) props.closeEditor();
                      }}
                      menuOptions={customExtendedMenu}
                    />
                  )}
                </PrimaryMenuBar>
              </div>
            </div>
            
            {/* 自定义右键菜单组件 - 只在自定义UI模式下显示 */}
            {showCustomUI && showContextMenu && (
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
            {/* 启用FingerBlocker以支持鼠标事件转发到画布 - 移到Tldraw外部，确保正确的事件拦截层级 */}
            <FingerBlocker getTlEditor={getTlEditor} wrapperRef={editorWrapperRefEl} />
          </>
        )}
        
        {/* 官方UI模式：在Tldraw组件内部显示ExtendedDrawingMenu */}
        {showOfficialUI && props.extendedMenu && (
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            zIndex: 'var(--tl-layer-header-footer)', // 使用页眉页脚层的预设z-index值
            pointerEvents: 'auto', // 确保菜单容器可以接收鼠标事件
          }}>
            <ExtendedDrawingMenu
              onLockClick={async () => {
                const editor = tlEditorRef.current;
                if (editor) {
                  await completeSave(editor);
                }
                if (props.closeEditor) props.closeEditor();
              }}
              menuOptions={customExtendedMenu}
            />
          </div>
        )}
      </Tldraw>
      {props.resizeEmbed && (
        <ResizeHandle
          resizeEmbed={resizeEmbed}
        />
      )}
    </div>
  );

  function resizeEmbed(pxWidthDiff: number, pxHeightDiff: number) {
    if (!props.resizeEmbed) return;
    props.resizeEmbed(pxWidthDiff, pxHeightDiff);
  }
};

// TldrawContent组件已被移除，使用统一的Tldraw和TldrawUi结构

/**
 * 检查是否需要导入SVG文件，避免重复导入
 */
async function checkAndImportSvgIfNeeded(filePath: string, editor: Editor) {
  try {
    // 获取插件实例
    const { plugin } = getGlobals();
    
    // 通过文件路径获取TFile对象
    const allFiles = plugin.app.vault.getFiles();
    const file = allFiles.find(f => f.path === filePath);
    
    if (!file) {
      return;
    }
    
    // 使用Obsidian API获取文件的绝对路径
    const absoluteFilePath = plugin.app.vault.getResourcePath(file);
    
    // 处理文件路径中的特殊字符（如空格）
    const encodedFilePath = encodeURI(absoluteFilePath);
    
    // 读取文件内容进行检查
    const response = await fetch(encodedFilePath);
    if (!response.ok) {
      return;
    }
    
    const fileContent = await response.text();
    
    // 检查文件是否已经是tldraw格式（包含tldraw元数据）
    const isTldrawFormat = fileContent.includes('tldraw') || fileContent.includes('ink');
    
    if (isTldrawFormat) {
      return;
    }
    
    // 检查文件扩展名是否为SVG
    const isSvgFile = filePath.toLowerCase().endsWith('.svg');
    
    if (!isSvgFile) {
      return;
    }
    
    // 只有常规SVG文件才需要导入
    // 使用固定位置导入常规SVG
    const offsetX = 100;
    const offsetY = 100;
    
    // 解析SVG并导入到tldraw编辑器
    const { shapes, imageData } = parseSvgToShapes(fileContent);
    
    if (shapes.length === 0) {
      // 尝试使用备用解析策略
      // 首先需要将SVG字符串解析为Document对象
      const parser = new DOMParser();
      const fallbackDoc = parser.parseFromString(fileContent, 'image/svg+xml');
      const fallbackResult = parseSvgToShapesFallback(fallbackDoc, imageData, fileContent.length);
      if (fallbackResult.shapes.length > 0) {
        importSvgToTldraw(editor, fallbackResult.shapes, fallbackResult.imageData, offsetX, offsetY);
      }
      return;
    }
    
    importSvgToTldraw(editor, shapes, imageData, offsetX, offsetY);
  } catch (error) {
    // 尝试使用备用方法：直接读取文件内容
    try {
      const { plugin } = getGlobals();
      const allFiles = plugin.app.vault.getFiles();
      const file = allFiles.find(f => f.path === filePath);
      
      if (file) {
        const fileContent = await plugin.app.vault.read(file);
        
        // 检查文件是否已经是tldraw格式
        const isTldrawFormat = fileContent.includes('tldraw') || fileContent.includes('ink');
        if (!isTldrawFormat && filePath.toLowerCase().endsWith('.svg')) {
          const { shapes, imageData } = parseSvgToShapes(fileContent);
          const offsetX = 100;
          const offsetY = 100;
          importSvgToTldraw(editor, shapes, imageData, offsetX, offsetY);
        }
      }
    } catch (fallbackError) {
      // Fail silently
    }
  }
}

/**
 * 编辑器初始化完成后导入SVG文件的函数
 * 这个函数模拟Import SVG菜单项的行为，确保在编辑器完全初始化后执行导入
 */
async function importSvgFileAfterEditorReady(filePath: string, editor: Editor) {
  try {
    // 检查文件路径是否有效
    if (!filePath) {
      return;
    }
    
    // 获取插件实例
    const { plugin } = getGlobals();
    
    // 通过文件路径获取TFile对象
    const allFiles = plugin.app.vault.getFiles();
    const file = allFiles.find(f => f.path === filePath);
    
    if (!file) {
      return;
    }
    
    // 使用Obsidian API读取文件内容
    const svgContent = await plugin.app.vault.read(file);
    
    // 动态计算导入位置：对于常规SVG，使用固定位置；对于其他情况使用画布中心
    let offsetX = 100;
    let offsetY = 100;
    
    // 检查是否为常规SVG，如果是则使用固定位置保持相对位置
    const isRegularSvg = !svgContent.includes('tldraw');
    
    if (isRegularSvg) {
      // 对于常规SVG，使用固定位置以保持笔划的相对位置
    } else {
      // 对于其他SVG（如tldraw格式），使用画布中心位置
      try {
        const viewportPageBounds = editor.getViewportPageBounds();
        if (viewportPageBounds) {
          offsetX = viewportPageBounds.center.x;
          offsetY = viewportPageBounds.center.y;
        }
      } catch (error) {
        // 使用默认位置
      }
    }
    
    // 解析SVG并导入到tldraw编辑器
    const { shapes, imageData } = parseSvgToShapes(svgContent);
    importSvgToTldraw(editor, shapes, imageData, offsetX, offsetY);
  } catch (error) {
    // Fail silently
  }
}

export { TldrawDrawingEditor };
export default TldrawDrawingEditorWrapper;