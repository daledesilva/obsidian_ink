---
title: Ink 数据格式
type: data-format
updated: 2026-08-04 20:31
---

# Ink 数据格式

## Ink 文件

`.writing` 与 `.drawing` 当前共用同一个 JSON envelope：

```ts
type InkFileData = {
  meta: {
    pluginVersion: string
    tldrawVersion: string
    previewIsOutdated?: boolean
    transcript?: string
  }
  tldraw: TLEditorSnapshot
  previewUri?: string
}
```

`pluginVersion` 从 `manifest.json` 读取；`tldrawVersion` 在源码中固定为 `2.4.3`。`tldraw` 保存完整 editor snapshot。`previewUri` 当前通常是 `editor.getSvgString()` 返回的 SVG 字符串；Preview 同时兼容以 `data` 开头的 image data URI。

Incremental save 设置 `meta.previewIsOutdated=true` 且省略 `previewUri`。Complete save 重新生成 SVG；成功时写 `previewUri` 并省略 `previewIsOutdated`。

虽然 builder 参数和 Metadata 类型包含 `transcript`，`buildFileData()` 当前没有把传入的 `transcript` 写进返回对象，因此 transcript 不能视为已完成的持久化能力。

## Writing Embed block

````markdown
```handwritten-ink
{
	"versionAtEmbed": "<plugin-version>",
	"filepath": "Ink/Writing/<name>.writing"
}
```
````

类型还声明了可选 `transcript`，但 `buildWritingEmbed()` 当前不写该字段。

## Drawing Embed block

````markdown
```handdrawn-ink
{
	"versionAtEmbed": "<plugin-version>",
	"filepath": "Ink/Drawing/<name>.drawing",
	"aspectRatio": 1
}
```
````

`width` 和 `aspectRatio` 是可选字段。缺失 `width` 表示 fluid width，渲染时铺满 Markdown block；旧版默认值 `500` 也按 fluid 解释并在下次回写时省略。用户执行 Resize 后才写入 explicit `width`。缺失 `aspectRatio` 时回退到 1。尺寸回写只替换 fenced block 内的 JSON，不重建整个 block。

## 文件命名与位置

默认子目录是 `Ink/Writing` 与 `Ink/Drawing`。文件名来自本地时间，格式近似 `YYYY.M.D - H.MMam|pm`；发生冲突时追加 ` (2)`、` (3)`。路径最终经过 Obsidian `normalizePath()`。

Attachment base path 由设置和创建动作所在 Markdown 文件决定，可使用 Obsidian attachment folder、Vault root 或当前笔记所在目录。

## 解析与兼容边界

- Ink 文件和 Embed block 都直接 `JSON.parse`，随后做 TypeScript cast；没有 schema version dispatcher、字段验证或 parse error recovery。
- `versionAtEmbed`、`pluginVersion` 和 `tldrawVersion` 被记录，但当前读取路径没有根据这些版本选择 migration。
- Writing 加载路径会准备 snapshot 并补充当前模板 shape；Drawing preparation 当前原样返回 snapshot。
- 移动或重命名 Ink 文件不会自动重写现有 Embed 的 `filepath`。

## Sources

- [Ink file envelope](../../src/utils/page-file.ts)
- [Embed formats](../../src/utils/embed.ts)
- [格式常量](../../src/constants.ts)
- [文件路径生成](../../src/utils/file-manipulation.ts)
- [默认设置](../../src/types/plugin-settings.ts)

## See Also

- [Ink 内容生命周期](../architecture/ink-content-lifecycle.md)
- [Markdown Embeds](../features/markdown-embeds.md)
- [Writing](../features/writing.md)
- [Drawing](../features/drawing.md)
