---
title: Wiki Index
type: overview
updated: 2026-08-04 18:53
---

# Wiki Index

<!-- LLM 维护的内容索引。每个页面一行：链接 + 单行摘要。 -->

## Overview

- [项目全景](overview.md) — Ink 的定位、架构、数据模型、源码布局与维护边界。

## Architecture

- [插件运行时生命周期](architecture/plugin-runtime-lifecycle.md) — 启动注册、独立 View、Markdown processor、React/tldraw 挂载和清理边界。
- [Ink 内容生命周期](architecture/ink-content-lifecycle.md) — 从创建、引用、编辑和保存，到 Preview、复制与移除的完整数据流。

## Features

- [Markdown Embeds](features/markdown-embeds.md) — Code block 引用模型、渲染流程、编辑状态与 Markdown 耦合点。
- [Writing](features/writing.md) — 有行手写页面、动态模板、camera、stroke stashing 与 Preview 行为。
- [Drawing](features/drawing.md) — Infinite canvas、Pen/Highlighter 预设、canvas-local 输入边界、Embed resize 与 Preview 行为。

## Reference

- [Ink 数据格式](reference/ink-data-formats.md) — Ink JSON envelope、两类 Embed block、文件路径与兼容边界。

## Maintenance

- [Wiki Log](log.md) — Wiki 初始化与 ingest 的追加式维护记录。

## See Also

- [项目全景](overview.md)
- [插件运行时生命周期](architecture/plugin-runtime-lifecycle.md)
- [Ink 数据格式](reference/ink-data-formats.md)
