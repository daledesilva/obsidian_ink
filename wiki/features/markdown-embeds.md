---
title: Markdown Embeds
type: feature
updated: 2026-08-04 17:29
---

# Markdown Embeds

## 功能边界

Ink 通过 fenced code block 把外部 Ink 文件嵌入 Markdown：Writing 使用 `handwritten-ink`，Drawing 使用 `handdrawn-ink`。Block 本身不保存笔迹，只保存引用和少量显示元数据；笔迹、tldraw document 和预览保存在目标 `.writing` 或 `.drawing` 文件中。

## 渲染流程

Processor 对 block source 执行 `JSON.parse`。存在 `filepath` 时，它创建 `MarkdownRenderChild`，解析 Vault 中的目标文件，并在 Jotai Provider 内挂载 React Embed。目标文件不存在时显示错误文字；source 不是合法 JSON 时没有专用 fallback。

锁定态使用目标文件的 `previewUri` 显示 SVG 或 data URI image。点击 Preview 会切换到 tldraw editor；退出 editor 前执行完整保存。Writing Preview 可按设置显示背景和书写线，Drawing Preview 可按设置显示背景和边框。

## 引用与编辑行为

- 多个 block 可以引用同一个 Ink 文件；任一位置的编辑都会改变共享文件。
- New command 插入后通过一次性 `localStorage` 标志请求新 Embed 自动进入编辑态；Drawing 只在 Source/Live Preview context 消费该请求，Reading mode 始终保持 preview-only。
- Remove embed 只删除 Markdown block，源 Ink 文件保留。
- Drawing Embed 默认使用 fluid width 铺满 Markdown block；手动调整后，explicit `width` 与 `aspectRatio` 在锁定时回写 block JSON。
- Drawing 在 Reading mode 不挂载进入 editor 的 click handler；Source/Live Preview context 保持可编辑。
- Drawing Embed 菜单支持 Open、Copy 和 Remove；Writing 支持 Copy 和 Remove。

## Markdown 耦合点

删除和 Drawing 尺寸回写都通过 `MarkdownPostProcessorContext.getSectionInfo()` 取得行区间，再操作 `workspace.activeEditor.editor`。这意味着操作依赖当前活动 editor 与 processor context 对应同一 Markdown 内容；当前实现没有额外的 source-file identity check。

`applyCommonAncestorStyling()` 会给 `.cm-embed-block` 添加插件 class，并抵消 `.cm-scroller` 的左右 padding，让 Embed 可以更充分使用页面宽度。

## Sources

- [Embed 数据与编辑辅助](../../src/utils/embed.ts)
- [Writing processor/widget](../../src/extensions/widgets/writing-embed-widget.tsx)
- [Drawing processor/widget](../../src/extensions/widgets/drawing-embed-widget.tsx)
- [Writing Embed](../../src/tldraw/writing/writing-embed.tsx)
- [Drawing Embed](../../src/tldraw/drawing/drawing-embed.tsx)

## See Also

- [Ink 内容生命周期](../architecture/ink-content-lifecycle.md)
- [Ink 数据格式](../reference/ink-data-formats.md)
- [Writing](writing.md)
- [Drawing](drawing.md)
