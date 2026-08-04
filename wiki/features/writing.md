---
title: Writing
type: feature
updated: 2026-08-04 17:29
---

# Writing

## 定位

Writing 模式用于有行结构的连续手写。文件扩展名是 `.writing`，独立 View type 是 `ink_writing-view`，Markdown Embed key 是 `handwritten-ink`。

Writing 使用两个自定义 tldraw shape 作为模板：

- `writing-container`：透明的固定宽度页面边界。
- `writing-lines`：按固定间距绘制横线。

两者宽度固定为 2000 world units，行高为 150，最小页面高度为 225；不能移动、旋转、横向缩放或参与 binding。模板高度会随笔迹内容增长。

## Camera 与编辑体验

加载时 camera 缩放到完整页面宽度。独立 View 固定横向位置与 zoom，只允许受内容边界约束的纵向移动；Embed 模式锁定 camera。Editor 默认进入 draw tool，并根据 Obsidian light/dark theme 调整 tldraw preferences。

每次 stroke 完成会立即扩展模板，为继续书写预留约两行额外空间。完整保存生成 Preview 前，模板会暂时收紧到内容下方半行；导出后恢复可编辑高度。

## Stroke stashing

为缓解大量 SVG stroke 的性能问题，Writing 根据 `writingStrokeLimit` 暂时从 live tldraw store 移除较旧的已完成 draw shape，默认阈值为 200。Camera 移动或保存前会恢复 stash；继续输入时再重新 stash。Store 变更以忽略 history 的方式执行，避免把性能处理混入用户 undo history。

完整 snapshot 和 SVG Preview 都在恢复旧 stroke 后生成，因此 stash 的内容仍应保存在文件和预览中。

## 保存与 Preview

短延迟保存写入 snapshot 并标记 Preview 过期；完整保存写入 snapshot 与 SVG `previewUri`。Writing Preview 根据 SVG 实际高度调整 Embed 容器，并可通过设置控制锁定态的横线和背景。

Embed 菜单支持 Copy writing 与 Remove embed。独立 View 与 Embed 共用同一个 `TldrawWritingEditor`；Writing 转 Drawing 和独立打开的相关代码目前被注释，不属于当前功能。

## 兼容处理

加载 Writing snapshot 时会调用 `prepareWritingSnapshot()`，随后确保新的 `writing-lines` 与 `writing-container` shape 存在。迁移 helper 声称过滤旧模板 shape，但当前实现没有把过滤结果重新写回返回的 snapshot；因此不能假设旧 shape 已实际删除。

## Sources

- [Writing editor](../../src/tldraw/writing/tldraw-writing-editor.tsx)
- [Writing Embed](../../src/tldraw/writing/writing-embed.tsx)
- [Writing View](../../src/views/writing-view.tsx)
- [Writing container shape](../../src/tldraw/writing-shapes/writing-container.tsx)
- [Writing lines shape](../../src/tldraw/writing-shapes/writing-lines.tsx)
- [tldraw helpers](../../src/utils/tldraw-helpers.ts)

## See Also

- [Markdown Embeds](markdown-embeds.md)
- [Ink 内容生命周期](../architecture/ink-content-lifecycle.md)
- [Ink 数据格式](../reference/ink-data-formats.md)
- [Drawing](drawing.md)
