# AGENTS.md

This file provides guidance to agents when working with code in this repository.

Shared behavior lives in `.cursor/rules/` (Cursor), `.devin/` (Devin), and `.agents/` (Antigravity). This page is the project-specific overview those tools do not replace.

## Project Overview

Obsidian Ink is an Obsidian community plugin that lets users write and draw with a stylus inside Obsidian markdown notes.

Ink content is stored as standard SVG files and embedded in notes using normal Obsidian SVG image embeds plus a URL-parameter edit link. If the plugin is disabled or uninstalled, embeds degrade to displaying the SVG.

On Boox eInk tablets, a companion Android app (eInk Bridge, separate `eink-bridge` repo) can capture pen input with low latency and stream strokes to this plugin over a loopback WebSocket on the same device. Protocol and Bridge implementation details are documented in the `eink-bridge` repo only.

## Folder Structure

- `src/` — plugin code (CodeMirror 6 widgets, tldraw editors, commands, logic)
- `docs/` — plugin documentation
- `tests/` — unit and e2e tests
- `qa-test-vault/` — test vault used by e2e and manual QA (generated)
- `scripts/` — build, release, and debug helper scripts

## Tech Stack

TypeScript, Obsidian API, CodeMirror 6, and tldraw (pinned in `package.json`; do not upgrade without explicit sign-off). SVG metadata uses `@xmldom/xmldom`. Tests use Jest and WebdriverIO. The bundle is built with esbuild. See `.cursor/rules/tech-stack.mdc`.

## Git Workflow

Branch names use `<prefix>/<short-description>` in kebab-case. Commit only when asked. See `.cursor/rules/git-workflow.mdc` and `.cursor/rules/committing-changes-with-git.mdc`.

## Documentation Standards

Store docs in `docs/`, one page per concept. Companion-app protocol docs belong in `eink-bridge`, not here. See `.cursor/rules/documentation-standards.mdc`.

## Editing Guidelines

Follow existing patterns in the codebase. Verify fixes by running the relevant path. See `.cursor/rules/editing-guidelines.mdc`.

## Key Constraints

- eInk latency is a product requirement. Avoid changes that increase input-to-ink latency on Boox targets.
- Device-only preferences go in device-local storage, not synced plugin settings. See `.cursor/rules/device-local-settings.mdc`.
- ClickUp work for this plugin is folder `90160118195` (Oi: Obsidian Ink). See `.cursor/rules/clickup.mdc`.
