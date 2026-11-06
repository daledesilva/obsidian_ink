---
name: align-ide-tooling
description: Align IDE and agent tooling between Cursor, Devin, and Antigravity.
---

# Align IDE tooling between Cursor, Devin, and Antigravity

Three-way sync between Cursor, Devin, and Antigravity tooling to keep all three environments' agent capabilities aligned.

Any text after `/align-ide-tooling` is optional context — e.g. specific tooling types to sync (`commands`, `skills`, `rules`, `plans`), or a direction hint (`cursor-to-devin`, `devin-to-cursor`, `to-antigravity`, `from-antigravity`, `all`).

## Scope

- Target the current project repository.
- Sync tooling between `.cursor/`, `.devin/`, and `.agents/` directories.
- Tooling includes commands, skills, rules, plans, and related configuration.
- Do not commit, push, or change branches unless the user explicitly asks.
- Preserve existing customizations in all locations when the newer file is on that side — never overwrite newer content with an older copy.

## Modification times

Before copying or overwriting any paired tooling file:

1. Compare last-modified timestamps on disk for each source/target pair (`stat`, `ls -lt`, or equivalent — do not rely on git history alone).
2. **Missing on one side** — create the counterpart from the file that exists.
3. **Both exist** — treat the **newer** file as source and the **older** as target; transfer content (with format conversion across Cursor ↔ Devin ↔ Antigravity) so recent edits replace stale copies.
4. **Timestamps within ~1 minute** — ambiguous; ask the user which version to keep before overwriting.
5. Report which file was newer for each synced pair in the output.

User direction hints limit which pairs are in scope, but modification times still govern overwrite: do not push an older file onto a newer one even when direction would suggest it.

## What gets synced

| Cursor | Devin | Antigravity | Sync behavior |
|---|---|---|---|
| `.cursor/commands/*.md` | `.devin/skills/*/SKILL.md` | `.agents/skills/*/SKILL.md` | Three-way sync (convert formats / frontmatter) |
| `.cursor/rules/*.mdc` | Devin reads automatically | `.agents/rules/*.md` | Cursor `.mdc` frontmatter converted for Antigravity `.md` |
| `.plans/*.md` | Shared location | Shared location | No sync needed (all IDEs share same location) |
| `.devin/skills/*/SKILL.md` | `.cursor/commands/*.md` | `.agents/skills/*/SKILL.md` | Three-way sync (convert formats) |
| `.agents/skills/*/SKILL.md` | `.cursor/commands/*.md` | `.devin/skills/*/SKILL.md` | Three-way sync (convert formats) |

## Steps

1. Parse sync direction and tooling types from context.
2. Synchronize Skills and Commands:
   - Match by command/skill name.
   - For Cursor commands, strip/add YAML frontmatter (`name` and `description`).
   - Devin skills and Antigravity skills both use `SKILL.md` with YAML frontmatter. Devin optionally adds `triggers:` and `allowed-tools:`, which Antigravity safely ignores.
3. Synchronize Rules:
   - For Cursor `.mdc` rules, convert to `.agents/rules/<name>.md` by adapting or removing Cursor-specific frontmatter (`alwaysApply`, `globs`).
   - If an Antigravity rule in `.agents/rules/` is edited and newer, propagate improvements back to `.cursor/rules/<name>.mdc`.
4. Report all synced, created, and skipped items.
