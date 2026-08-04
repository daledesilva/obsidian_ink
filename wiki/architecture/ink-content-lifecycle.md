---
title: Ink 内容生命周期
type: architecture
updated: 2026-08-04 17:29
---

# Ink 内容生命周期

## 创建与插入

New command 从当前 Markdown 文件取得上下文，按设置计算 attachment base path 和 Writing/Drawing 子目录，用当前时间生成文件名，并通过 `(2)`、`(3)` 等后缀避免冲突。缺失目录会逐层创建。

新文件写入对应默认 tldraw snapshot，然后在光标处插入 Markdown code block。命令同时在 `localStorage` 写入一次性的 `ddc_ink_activateNextEmbed=true`；下一个挂载的 Ink Embed 读取并删除该标志，在约 200 ms 后切换到编辑态。

Existing command 只插入已有文件的路径引用。Copied command 可让新 Embed 指向同一文件，也可先复制源文件再建立独立引用。因此多个 Embed 可以共享同一 Ink 文件。

## 加载与状态切换

Writing 与 Drawing Embed 都采用四态模型：

```text
preview → loadingEditor → editor → loadingPreview → preview
```

Preview 从 Ink 文件读取 `previewUri`；缺失预览时显示空白占位 SVG。点击 Preview 会挂载 editor。退出编辑时先执行 `saveAndHalt()`，清除 timer/listener，再切回 Preview。

## 保存节奏

两类 editor 都监听 tldraw store 的用户变更，并区分 pointer、camera、stroke start/continue/complete 和 erase 等 activity。

- 短延迟保存：最后一次相关输入后 500 ms 获取 snapshot，写入 `previewIsOutdated: true`，不生成新预览。
- 完整保存：最后一次相关输入后 2000 ms 获取 snapshot 和 SVG，把 SVG 字符串写入 `previewUri`；成功时不再保留 `previewIsOutdated`。
- 退出嵌入编辑：立即执行完整保存，并停止后续 listener/timer。

独立 View 通过 Obsidian View 保存协议提交；Embed 通过 `vault.modify()` 直接提交。同一个 Ink 文件被多个 Embed 或 View 同时编辑时，当前代码没有显式冲突合并或 revision check。

## Preview 与尺寸

Writing 完整保存前把模板高度收紧到内容所需行数，导出 SVG 后再恢复可继续书写的额外空间；Preview 根据 SVG 实际高度调整容器。

Drawing Preview 的显示框由 Markdown block 的 `width` 和 `aspectRatio` 决定。用户拖动 ResizeHandle 时只更新内存和 DOM；退出编辑模式后，Widget 才把新尺寸写回当前 Markdown block。宽度下限为 350 px、上限为当前页面宽度，高度下限为 150 px。

## 移除、复制与删除语义

- Remove embed 删除活动 Markdown editor 中对应 code block，不删除 `.writing` 或 `.drawing` 文件。
- Copy 只把文件路径记入 `localStorage`；后续插入时再选择共享实例或复制文件。
- 删除或移动源 Ink 文件不会自动修复引用；Widget 加载时会显示 file-not-found 提示。
- Drawing 提供从 Embed 打开独立文件的菜单项；Writing 的同类菜单代码当前被注释。

## Sources

- [Writing commands](../../src/commands/insert-new-writing-file.ts)
- [Drawing commands](../../src/commands/insert-new-drawing-file.ts)
- [文件路径生成](../../src/utils/file-manipulation.ts)
- [本地一次性状态](../../src/utils/storage.ts)
- [Writing editor](../../src/tldraw/writing/tldraw-writing-editor.tsx)
- [Drawing editor](../../src/tldraw/drawing/tldraw-drawing-editor.tsx)
- [Embed helpers](../../src/utils/embed.ts)

## See Also

- [插件运行时生命周期](plugin-runtime-lifecycle.md)
- [Markdown Embeds](../features/markdown-embeds.md)
- [Ink 数据格式](../reference/ink-data-formats.md)
