# SCHEMA — LLM Wiki

## Project

Ink 是一个持续维护的 Obsidian 插件，基于 TypeScript、React 与 tldraw，为 Markdown 笔记提供可嵌入、可独立编辑的手写与自由绘图内容。

## Project Structure

项目中的文件均可编辑；下表描述职责，不表示只读边界。

| 路径 | 角色 |
|------|------|
| `README.md` | 用户可见的功能说明、安装方法、路线图与已知限制 |
| `src/main.ts` | 插件入口；加载设置并注册命令、View、Embed processor 与提示 |
| `src/commands/` | 创建、选择、插入及复用 writing/drawing 文件的 Obsidian Commands |
| `src/extensions/` | Markdown code block processor 与 React Embed 挂载层 |
| `src/views/` | `.writing`、`.drawing` 文件的 Obsidian 自定义 View |
| `src/tldraw/` | tldraw 编辑器、嵌入组件、菜单、交互和保存策略 |
| `src/utils/` | 文件路径、数据序列化、预览、Obsidian/tldraw 适配及相邻单元测试 |
| `src/types/`, `src/defaults/` | 插件设置类型、默认设置与初始 tldraw snapshot |
| `src/components/`, `src/tabs/`, `src/modals/`, `src/notices/` | 设置界面、通用 UI、对话框和用户提示 |
| `src/logic/` | 状态、字符串处理、管理逻辑与尚未完整实现的 OCR 服务 |
| `src/graphics/`, `src/placeholders/`, `src/static/`, `src/ddc-library/` | 图标、占位图、静态资源与共享样式 |
| `manifest*.json`, `versions.json` | Obsidian 插件元数据、发布通道与版本映射 |
| `package.json`, `package-lock.json` | Node 依赖、npm scripts 与锁定版本 |
| `esbuild.config.mjs`, `tsconfig.json`, `jest.config.ts`, `babel.config.js` | 构建、类型检查和测试配置 |
| `scripts/`, `.github/workflows/` | internal、beta 与 public 发布流程 |
| `docs/media/` | README 使用的展示与社交媒体资源 |
| `coverage/` | Jest 生成的覆盖率产物；通常不作为知识来源 |

## Wiki Structure

```text
wiki/
├── index.md          # 全部 Wiki 页面索引
├── log.md            # 追加式维护日志
├── overview.md       # 项目全景与导航入口
├── architecture/     # 生命周期、数据流和系统边界
├── features/         # Writing、Drawing、Embed、Settings 等用户能力
├── reference/        # 模块、数据格式、兼容性和限制
├── workflows/        # 开发、测试、构建与发布流程
└── decisions/        # 重要架构决策及其依据
```

子目录在首次产生相应页面时创建，不放置无内容的占位页。

## Page Types

- **overview** — 项目全景、当前边界和主要导航。
- **architecture** — 插件生命周期、组件关系或跨模块数据流。
- **feature** — 一项面向用户的能力、行为与限制。
- **module** — 一个源码子系统的职责、入口、依赖和扩展点。
- **data-format** — `.writing`、`.drawing`、Markdown embed 或设置的结构与兼容规则。
- **workflow** — 开发、验证、构建、发布或维护流程。
- **decision** — 已实施的重要技术决策、理由、替代方案和后果。
- **constraint** — 性能、平台兼容、技术债或尚未实现的边界。

## Conventions

- Wiki 正文使用中文；源码标识、API、文件扩展名和必要技术术语保留 English。
- 文件名使用 kebab-case，例如 `embed-lifecycle.md`。
- 内链使用相对 Markdown link，例如 `[Embed 生命周期](architecture/embed-lifecycle.md)`。
- 每个 Wiki 页面包含 YAML frontmatter：

  ```yaml
  ---
  title: 页面标题
  type: overview | architecture | feature | module | data-format | workflow | decision | constraint
  updated: YYYY-MM-DD HH:MM
  ---
  ```

- `updated` 精确到分钟，使用项目当前时区。
- 页面底部使用 `## See Also` 列出真正相关的 Wiki 页面；不为凑链接制造引用。
- 明确区分当前实现、历史行为、README 路线图和推测性计划。
- 发现版本、许可证或行为声明冲突时，分别记录来源和观察时间，不擅自裁决。
- Wiki 只写当前可复用知识；任务讨论、审查过程和流水账只进入合适的日志或工作产物。

## Ingest Workflow

1. 判断 source 变化是否产生长期知识；trivial、纯措辞或 runtime-only 变化不 ingest。
2. 优先读取相关 Wiki 页面；事实不足时完整读取目标 source，并以源码和项目配置为当前实现的权威依据。
3. 核心 ingest 顺序通常为：插件入口与生命周期 → 数据格式 → Embed/View/Editor → 文件管理与设置 → 构建测试发布。
4. 更新直接受影响的页面，并链式检查相关 architecture、feature、data-format 和 workflow 页面。
5. 更新 `wiki/index.md`，再向 `wiki/log.md` 追加一条简洁记录；`log.md` 不改写历史条目。
6. 小而集中的 ingest 由 main agent 完成；大型、跨模块或已委托实现按项目级 `AGENTS.md` 规则处理。
7. 验收来源覆盖、页面间一致性、链接和当前/计划状态后结束 ingest。

默认不 ingest：`coverage/`、`dist/`、`node_modules/`、生成缓存以及与行为无关的媒体文件。只有当其本身成为任务主题时才读取。

## Query Workflow

1. 每个 session/worktree 首次非简单任务读取 `SCHEMA.md` 与 `wiki/index.md`；内容未变时不重复读取。
2. 每个问题先读取最多一个最相关的 Wiki 页面。
3. 信息不足时再读取相邻 Wiki 页面或回溯源文件。
4. 回答问题；只有长期有用的新分析才写入 Wiki。

## Lint Checklist

- [ ] 页面间是否存在矛盾。
- [ ] 当前实现是否被过时路线图或历史声明覆盖。
- [ ] 是否存在没有入链的孤立页面。
- [ ] 是否存在被引用但缺失的页面。
- [ ] 是否缺少必要交叉引用。
- [ ] `wiki/index.md` 是否覆盖全部页面且摘要仍准确。
- [ ] `wiki/log.md` 是否保持追加式记录。
- [ ] 是否误 ingest 生成文件、缓存或无关媒体。

## Log Format

每条记录以二级标题开头，便于 grep 解析：

```markdown
## [YYYY-MM-DD HH:MM] operation | description

简要说明做了什么、影响了哪些页面。
```
