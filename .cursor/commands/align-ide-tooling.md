# Align IDE tooling between Cursor, Devin, and Antigravity

Three-way sync between Cursor, Devin, and Antigravity tooling to keep all three environments' agent capabilities aligned.

Any text after `/align-ide-tooling` is optional context — e.g. specific tooling types to sync (`commands`, `skills`, `rules`, `plans`), or a direction hint (`cursor-to-devin`, `devin-to-cursor`, `to-antigravity`, `from-antigravity`, `both`).

## Scope

- Target the current project repository.
- Sync tooling between `.cursor/`, `.devin/`, and `.agents/` directories.
- Tooling includes commands, skills, rules, plans, and related configuration.
- Do not commit, push, or change branches unless the user explicitly asks.
- Preserve existing customizations in both locations when the newer file is on that side — never overwrite newer content with an older copy.

## Modification times

Before copying or overwriting any paired tooling file:

1. Compare last-modified timestamps on disk for each source/target pair (`stat`, `ls -lt`, or equivalent — do not rely on git history alone).
2. **Missing on one side** — create the counterpart from the file that exists.
3. **Both exist** — treat the **newer** file as source and the **older** as target; transfer content (with format conversion when crossing Cursor ↔ Devin) so recent edits replace stale copies.
4. **Timestamps within ~1 minute** — ambiguous; ask the user which version to keep before overwriting.
5. Report which file was newer for each synced pair in the output.

User direction hints (`cursor-to-devin`, `devin-to-cursor`) limit which pairs are in scope, but modification times still govern overwrite: do not push an older file onto a newer one even when direction would suggest it.

## What gets synced

| Cursor | Devin | Antigravity | Sync behavior |
|---|---|---|---|
| `.cursor/commands/*.md` | `.devin/skills/*/SKILL.md` | `.agents/skills/*/SKILL.md` | Three-way sync (convert formats / frontmatter) |
| `.cursor/rules/*.mdc` | Devin reads automatically | `.agents/rules/*.md` | Cursor `.mdc` frontmatter converted for Antigravity `.md` |
| `.plans/*.md` | Shared location | Shared location | No sync needed (all IDEs share same location) |
| `.devin/skills/*/SKILL.md` | `.cursor/commands/*.md` | `.agents/skills/*/SKILL.md` | Three-way sync (convert formats) |
| `.agents/skills/*/SKILL.md` | `.cursor/commands/*.md` | `.devin/skills/*/SKILL.md` | Three-way sync (convert formats) |
| `.devin/config.json` | Project-specific | Project-specific | Copied once from `shared/.devin/config.json` by `/update-agent-tooling` when missing; not kept in sync because it holds project-specific settings |

## Steps

1. Parse sync direction from context:
   - `cursor-to-devin`: Only sync from Cursor to Devin
   - `devin-to-cursor`: Only sync from Devin to Cursor
   - `both` or missing: Two-way sync (default)

2. Parse tooling types from context:
   - If specific types named (e.g. `commands`, `skills`, `rules`, `plans`), sync only those
   - If missing, sync all types

3. Cursor → Devin sync (when direction allows):
   - **Commands to skills:** For each `.cursor/commands/*.md` (and its paired `.devin/skills/<name>/SKILL.md` if present):
     - Compare modification times per **Modification times** above
     - Sync only when the Cursor command is newer, or the Devin skill is missing
     - Read the Cursor command file
     - Convert to Devin skill format (add frontmatter with `name`, `description`, `triggers`, `allowed-tools`)
     - Create/update `.devin/skills/<command-name>/SKILL.md`
     - Use the command filename (without .md) as the skill name
   - **Plans:** No action needed — both IDEs use `.plans/` shared location
   - **Rules:** No action needed — Devin reads Cursor rules automatically

4. Devin → Cursor sync (when direction allows):
   - **Skills to commands:** For each `.devin/skills/*/SKILL.md` (and its paired `.cursor/commands/<name>.md` if present):
     - Compare modification times per **Modification times** above
     - Sync only when the Devin skill is newer, or the Cursor command is missing
     - Read the Devin skill file
     - Convert to Cursor command format (remove frontmatter, keep content)
     - Create/update `.cursor/commands/<skill-name>.md`
     - Use the skill directory name as the command filename
   - **Plans:** No action needed — both IDEs use `.plans/` shared location

5. Handle remaining conflicts:
   - If a pair could not be resolved by modification times (e.g. close timestamps), ask the user which version to keep
   - Preserve customizations on the side that already has the newer file

6. Verify:
   - List all tooling that was synced
   - Report any conflicts or skipped items
   - Do not build or deploy for tooling-only changes

## Format conversion notes

**Cursor command → Devin skill:**
- Add YAML frontmatter with:
  - `name`: from filename (without .md)
  - `description`: first line of content (without # prefix)
  - `triggers: [user]` (default)
  - `allowed-tools`: infer from content (exec, read, write, edit, mcp_call_tool)
- Keep all existing content

**Devin skill → Cursor command:**
- Remove YAML frontmatter
- Keep all existing content
- No additional conversion needed

## Output

When done, show:
- Sync direction performed
- Tooling types synced
- Commands ↔ skills converted (list each)
- Plans synced (list each)
- Any conflicts or skipped items
- Files that were out of sync and are now aligned
