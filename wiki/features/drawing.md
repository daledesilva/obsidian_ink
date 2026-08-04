---
title: Drawing
type: feature
updated: 2026-08-04 20:34
---

# Drawing

## 定位

Drawing 模式用于自由笔绘和 infinite-canvas 风格草图。文件扩展名是 `.drawing`，独立 View type 是 `ink_drawing-view`，Markdown Embed key 是 `handdrawn-ink`。

Drawing 使用 tldraw 默认 shape/tool 集，没有 Writing 的固定页面模板。加载有内容的文件时 camera 对准当前页面 bounds；空文件使用约 `0.3` zoom。Grid 在 editor mount 时默认开启，并可通过 extended menu 切换。

## 输入与 Camera

Drawing editor 在 wrapper capture 层补充了以下键盘和 pointer 行为：

- `Ctrl/Cmd+Z` undo；`Ctrl/Cmd+Shift+Z` 或 `Ctrl/Cmd+Y` redo。
- 按住 Space 拖动来平移 camera。
- 按住 `Z` 垂直拖动，以 Drawing viewport 的几何中心为锚点缩放；范围限制为 `0.1`–`8`。
- Select tool 且未编辑文本时，Backspace/Delete 删除选中 shape。

Embed 默认锁定 camera；Space/Z gesture 开始时临时解锁，结束后重新锁定。容器使用 `touch-action: none` 和 pointer capture，避免浏览器或 Obsidian 抢占触控手势。

Drawing wrapper 是键盘与 clipboard event boundary。每次 pointer down 会先在 wrapper capture 阶段调用 `editor.focus()`；这是必要的，因为 tldraw 根容器会停止 pointer bubble，不能依赖 wrapper bubble handler 取得焦点。Undo/redo/Delete 在 capture 阶段由 Drawing 本地执行并消费；其他 keydown、copy、cut、paste event 会先交给内部 canvas，再在 wrapper bubble 阶段停止传播，防止嵌入模式下的事件继续落到外层 CodeMirror 并操作整个 Embed block。

## Drawing 工具预设

Drawing 顶部工具条提供 Select、Pen、Highlighter 和 Eraser。Pen 与 Highlighter 共用一组紧凑预设：黑、红、蓝、绿四种颜色，以及 Small、Medium、Large 三档尺寸；默认是黑色 Medium Pen。选择颜色或尺寸时会回到最近使用的 Pen/Highlighter，而不是继续停留在 Select 或 Eraser。

预设直接写入 tldraw 的 `DefaultColorStyle` 与 `DefaultSizeStyle`，Highlighter 使用原生 `highlight` shape/tool。调色圆点使用 tldraw 2.4.3 对应的 light/dark palette；Highlighter 模式展示实际荧光色，其中 black 对应传统黄色荧光笔。

Activity classification 同时把 `draw` 和 `highlight` shape 视为 Drawing stroke，因而两者共用 incremental/complete save 节奏。

## Embed 尺寸

Drawing block 保存可选 `width` 与 `aspectRatio`。新 Embed 默认不写 `width`，渲染时铺满 Markdown block 的当前可用宽度；旧版自动写入的 `500` 也视为 fluid default。ResizeHandle 允许调整：一旦用户拖动，Embed 转为 explicit width；宽度不低于 350 px且不超过 Markdown block 宽度，高度不低于 150 px。拖动期间只更新 DOM/ref，退出 editor 后才把明确尺寸回写 Markdown。

窗口 resize 时，fluid Embed 随 Markdown block 宽度铺满；explicit width 只在可用区域变窄时临时收缩，并按保存的 aspect ratio 重新计算高度。

## 保存与 Preview

Drawing 与 Writing 使用相同的 500 ms incremental save 和 2000 ms complete save 节奏。短保存写 snapshot 和 `previewIsOutdated`；完整保存导出所有当前页面 shape 的 SVG，并写入 `previewUri`。

Preview 可通过设置显示背景与 frame。Reading mode 中 Drawing 是纯 preview：没有 click handler、editable cursor 或自动激活路径；只有 Source/Live Preview editing context 可以点击进入 editor。Embed 菜单支持 Copy、Open 和 Remove；独立 View 的 extended menu 支持 Copy drawing 与 Grid on/off。

## 范围边界

当前明确不纳入范围：方格纸、点阵纸、横线或纯色背景，以及手写公式 OCR/LaTeX。

## Sources

- [Drawing editor](../../src/tldraw/drawing/tldraw-drawing-editor.tsx)
- [Drawing Embed](../../src/tldraw/drawing/drawing-embed.tsx)
- [Drawing View](../../src/views/drawing-view.tsx)
- [Drawing processor/widget](../../src/extensions/widgets/drawing-embed-widget.tsx)
- [Drawing keyboard shortcuts](../../src/tldraw/drawing/drawing-keyboard-shortcuts.ts)
- [Drawing camera math](../../src/tldraw/drawing/drawing-camera.ts)
- [Drawing tool presets](../../src/tldraw/drawing-menu/drawing-tool-presets.ts)
- [tldraw helpers](../../src/utils/tldraw-helpers.ts)

## See Also

- [Markdown Embeds](markdown-embeds.md)
- [Ink 内容生命周期](../architecture/ink-content-lifecycle.md)
- [Ink 数据格式](../reference/ink-data-formats.md)
- [Writing](writing.md)
