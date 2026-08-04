---
title: Ink 项目全景
type: overview
updated: 2026-08-04 17:29
---

# Ink 项目全景

## 项目定位

Ink 是一个持续维护的 Obsidian Community Plugin。它让用户用 stylus、digital pen 或 Apple Pencil 在 Markdown 段落之间直接书写或绘图，也允许将 Ink 文件作为独立标签页打开编辑。项目使用 TypeScript、React 和 tldraw，并支持非 desktop-only 的 Obsidian 环境。

主要用户场景包括手写笔记、草图、公式和科学记号。Writing 强调有行结构的连续书写；Drawing 提供更自由的 infinite canvas。项目定位和用户说明见 [README](../README.md)，Obsidian 元数据见 [manifest.json](../manifest.json)。

## 运行时架构

插件入口 [src/main.ts](../src/main.ts) 在加载时读取设置，然后按 Writing/Drawing 的启用状态注册：

1. Obsidian Commands，用于创建或选择 Ink 文件并向当前 Markdown 编辑器插入引用。
2. `.writing` 与 `.drawing` 自定义 View，用于独立打开 Ink 文件。
3. `handwritten-ink` 与 `handdrawn-ink` Markdown code block processor，用于在笔记中挂载 React Embed。
4. 设置页、图标、欢迎提示和版本提示。

Embed processor 从 code block JSON 中取得文件路径，通过 Obsidian Vault 读取 Ink 文件，然后把数据交给对应 React/tldraw 组件。用户输入触发短延迟 incremental save 和较长延迟 complete save；完整保存可同时更新 snapshot 与预览数据。

## 数据与存储

Ink 使用两层引用模型：

- `.writing` / `.drawing` 文件保存 JSON，核心字段包括插件版本、tldraw 版本、`TLEditorSnapshot`、预览状态和可选 preview data URI。当前类型定义见 [page-file.ts](../src/utils/page-file.ts)。
- Markdown code block 保存 embed 元数据，包括 `versionAtEmbed`、目标文件路径，以及 Drawing 的宽度和宽高比。当前生成逻辑见 [embed.ts](../src/utils/embed.ts)。

默认文件组织在 Obsidian attachment 位置下的 `Ink/Writing` 与 `Ink/Drawing` 子目录；设置允许选择 Obsidian attachment folder、Vault root 或当前笔记旁边。路径选择和冲突规避集中在 `src/utils/`。

## 主要源码区域

| 区域 | 当前职责 |
|------|----------|
| `src/commands/` | 新建、选择、插入和复用 Ink 文件 |
| `src/extensions/widgets/` | Markdown Embed 注册、文件读取和 React 生命周期 |
| `src/views/` | 独立 Ink 文件 View 与 Obsidian 保存协议 |
| `src/tldraw/` | Writing/Drawing 编辑器、Embed、菜单和交互 |
| `src/utils/` | 数据格式、文件路径、预览生成和平台适配 |
| `src/tabs/settings-tab/` | 功能开关、存储目录和 Writing/Drawing 设置 |
| `src/logic/` | 状态与辅助逻辑；OCR 当前仍是占位实现 |

## 开发与发布

项目已有 `package-lock.json`，当前脚本以 npm 为准：

- `npm test`：运行 Jest 并生成 `coverage/`。
- `npm run build`：先执行 TypeScript no-emit 检查，再以 esbuild 生成 production bundle。
- `npm run dev`：启动 esbuild watch；除非任务明确需要，不由自动化流程长期运行。
- `npm run internal-release`、`beta-release`、`public-release`：进入对应发布脚本和 GitHub Actions 流程。

现有测试主要覆盖 attachment path、日期文件名、子目录和 filepath parsing 等工具函数。

## 当前约束与维护注意点

- README 记录 tldraw SVG 在 iOS 上大量 stroke 时存在性能压力；Writing 会隐藏较旧 stroke 以缓解延迟。
- 当前 Markdown embed 依赖插件解释 code block。README 将静态图片型 embed 描述为未来方向，不应视为已实现。
- OCR/transcript 仍未完整实现；[ocr-service.ts](../src/logic/ocr-service.ts) 当前返回占位内容。
- 初始化时观察到 `package.json` 的版本为 `0.3.3`，而 `manifest.json` 为 `0.3.4`；后续版本维护需要确认预期同步规则。
- 初始化时观察到 `package.json` 声明 MIT，而 README 声明 CC BY-NC-ND 4.0；Wiki 仅记录来源冲突，不判定实际许可证。
- `coverage/` 是生成产物，不作为默认知识来源。

## See Also

- [Wiki Index](index.md)
- [插件运行时生命周期](architecture/plugin-runtime-lifecycle.md)
- [Ink 内容生命周期](architecture/ink-content-lifecycle.md)
- [Markdown Embeds](features/markdown-embeds.md)
- [Writing](features/writing.md)
- [Drawing](features/drawing.md)
- [Ink 数据格式](reference/ink-data-formats.md)
