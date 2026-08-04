---
title: 插件运行时生命周期
type: architecture
updated: 2026-08-04 17:29
---

# 插件运行时生命周期

## 启动与注册

`InkPlugin.onload()` 是运行时入口。它先把持久化数据合并到 `DEFAULT_SETTINGS`，再注册图标和功能。Writing 与 Drawing 是两个独立开关：某一模式被禁用时，该模式的 View、Markdown processor 和三个编辑器命令都不会注册；设置页与 onboarding/version notice 始终注册。开关变化需要重启 Obsidian 才能重建这些注册项。

每种模式提供三类命令：

- New：创建新的 Ink 文件并插入 Embed。
- Existing：从 Vault 中按扩展名选择已有文件并插入引用。
- Copied：引用先前记住的文件，或先复制文件再插入新引用。

## 两条编辑入口

### 独立文件 View

`.writing` 和 `.drawing` 分别注册为 `ink_writing-view` 与 `ink_drawing-view`。Obsidian 把文件文本交给 `TextFileView.setViewData()`，View 解析 JSON 并挂载对应 React/tldraw editor。

Editor 保存时把新的 `InkFileData` 交回 View；View 更新内存中的 `pageData` 并调用 `TextFileView.save(false)`，最终由 `getViewData()` 序列化。切换文件或清理 View 时必须 unmount React root，以移除 store listener，防止旧 editor 延迟保存到新文件。

### Markdown Embed

`handwritten-ink` 和 `handdrawn-ink` code block processor 解析 block JSON，取得 `filepath`，再创建 `MarkdownRenderChild`。Widget 通过 Vault 直接读取目标 Ink 文件，并挂载 Writing/Drawing Embed。

Embed 内的 editor 保存不会经过 `TextFileView`，而是由 Widget 调用 `vault.modify()` 直接覆盖目标 Ink 文件。Widget unload 时 unmount React root。

## 组件边界

```text
InkPlugin
├── Commands ── create/select/copy Ink file ── insert Markdown block
├── TextFileView ── React editor ── TextFileView.save()
└── Markdown processor
    └── MarkdownRenderChild
        └── Embed state machine
            ├── SVG preview
            └── tldraw editor ── vault.modify()
```

`src/tldraw/` 负责 editor、preview、菜单和状态切换；`src/utils/` 负责数据格式、文件路径、tldraw 适配与预览生成。Obsidian 注册和持久化边界保留在入口、View、Widget 和 command 层。

## 清理与风险边界

- `InkPlugin.onunload()` 当前为空，主要清理由 Obsidian 的 register API、View `clear()` 和 `MarkdownRenderChild.onunload()` 承担。
- editor 自己持有短/长延迟 timer 和 tldraw store listener；unmount 时会清 timer 并注销 listener。
- JSON 解析使用直接 `JSON.parse` 和 TypeScript cast，没有 runtime schema validation。
- Widget 只对目标文件不存在提供可见提示；JSON 损坏、字段类型错误等情况没有本层恢复路径。

## Sources

- [插件入口](../../src/main.ts)
- [Writing View](../../src/views/writing-view.tsx)
- [Drawing View](../../src/views/drawing-view.tsx)
- [Writing Embed Widget](../../src/extensions/widgets/writing-embed-widget.tsx)
- [Drawing Embed Widget](../../src/extensions/widgets/drawing-embed-widget.tsx)

## See Also

- [Ink 内容生命周期](ink-content-lifecycle.md)
- [Ink 数据格式](../reference/ink-data-formats.md)
- [Markdown Embeds](../features/markdown-embeds.md)
