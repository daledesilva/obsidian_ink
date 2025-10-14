import React, { useRef, useEffect } from 'react';
import { Tldraw, Editor } from 'tldraw';
import 'tldraw/tldraw.css';

export default function FocusModeExample() {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    // 阻止浏览器默认右键菜单
    e.preventDefault();
    
    // 尝试将右键菜单事件转发给tldraw画布
    try {
      const canvas = containerRef.current?.querySelector('.tl-canvas') as HTMLElement | null;
      if (canvas) {
        // 创建并触发自定义右键菜单事件
        const forwardedEvent = new MouseEvent('contextmenu', {
          clientX: e.clientX,
          clientY: e.clientY,
          bubbles: true,
          composed: true,
          view: window
        });
        canvas.dispatchEvent(forwardedEvent);
      }
    } catch (error) {
      console.error('处理右键菜单时出错:', error);
    }
  };

  return (
    <div 
      ref={containerRef}
      className="tldraw__editor"
      style={{ width: '100%', height: '100vh' }}
      onContextMenu={handleContextMenu}
    >
      <Tldraw
        onMount={(editor) => {
          // [1] 启用焦点模式
          editor.updateInstanceState({ isFocusMode: true });
        }}
      />
    </div>
  );
}