---
title: Wiki Log
type: workflow
updated: 2026-08-04 20:34
---

# Wiki Log

## [2026-08-04 16:58] init | Wiki 初始化

创建 `SCHEMA.md`、`wiki/index.md`、`wiki/log.md` 和 `wiki/overview.md`，将项目定义为持续维护的 Obsidian Ink 插件。

## [2026-08-04 17:29] ingest | 首次核心源码吸收

新增插件运行时、内容生命周期、Markdown Embed、Writing、Drawing 和 Ink 数据格式页面，并更新 `wiki/index.md` 与 `wiki/overview.md` 的导航。

## [2026-08-04 18:29] fix | Drawing 键盘事件隔离

记录 Drawing 的 canvas-local undo/redo/Delete dispatcher，以及阻止 keyboard/clipboard event 传播到外层 CodeMirror 的容器边界；同时记录颜色/笔宽预设与 Highlighter 的后续范围，并排除背景纸和公式 OCR。

## [2026-08-04 18:53] feature | Drawing 笔工具预设

Drawing 新增黑/红/蓝/绿、Small/Medium/Large 与原生 Highlighter 工具；Pen/Highlighter 共用预设，Highlighter stroke 纳入 Drawing activity classification 和既有保存节奏。

## [2026-08-04 20:27] fix | Drawing focus 与中心缩放

Pointer down 在 capture 阶段显式 focus tldraw，避免 tldraw 截断 bubble 后 `Ctrl+Z` 落到外层 CodeMirror；按住 `Z` 拖动改为围绕 Drawing viewport 中心缩放。

## [2026-08-04 20:31] fix | Drawing 默认铺满内容宽度

新 Drawing Embed 默认使用 fluid width 铺满 Markdown block；旧 `500px` 默认值自动按 fluid 迁移，只有用户手动 Resize 后才保存 explicit width。

## [2026-08-04 20:34] fix | Reading mode preview-only

Drawing widget 将 Obsidian view mode 传入 Embed；Reading mode 移除编辑 click/cursor/自动激活，Source/Live Preview 仍可进入 editor。

## See Also

- [项目全景](overview.md)
- [Wiki Index](index.md)
