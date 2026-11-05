---
name: update-agent-tooling
description: Update agent tooling from reference repo
triggers:
  - user
allowed-tools:
  - read
  - exec
  - write
  - edit
  - mcp_call_tool
---
# Update agent tooling from reference repo

Sync Cursor, Devin, and Antigravity agent tooling from `_reference_ide-setup` into a target project.

Any text after `/update-agent-tooling` is optional context, such as a target repo path, environment name, or specific tooling type to check.

## Scope

- Target the primary repository in the current workspace unless the user names another repo or path.
- Use `_reference_ide-setup` as the source of truth for reusable agent tooling.
- Pull in missing shared/common tooling from `shared/`.
- Detect this project type, then pull in missing relevant tooling from the matching environment folder, such as `android-native/`, `react-native/`, `web-react/`, `obsidian-plugin/`, or `unity-mixed-reality/`.
- Agent tooling includes Cursor commands, skills, plugins, Devin skills/config, Antigravity skills, rules, and root `AGENTS.md`, scripts/templates they depend on, and docs that explain how to use them.
- Cursor tooling is copied to the target's `.cursor/`; Devin tooling is copied to the target's `.devin/`; Antigravity tooling is copied to the target's `.agents/` and root `AGENTS.md`.
- There is **no** shared ClickUp MCP JSON to copy. Point people at `shared/docs/cursor-mcp-clickup-cloud-agents.md` (and the root README ClickUp section) for the URL, global vs project vs Cloud Agents placement, **`~/.zshenv` `CLICKUP_API_TOKEN`** for REST reparenting, and **If nesting stops working**. Copy `shared/docs/cursor-mcp-clickup-cloud-agents.md` → target `docs/cursor-mcp-clickup-cloud-agents.md` and `shared/scripts/clickup-set-parent.sh` → target `scripts/clickup-set-parent.sh` when missing or when the reference copy is newer. Copy or merge environment `mcp.json` or `.devin/mcp_config.json` only when that environment still ships a project-bound server and it is missing from the target. Unity Editor control is the CLI (`unity pipeline install`, `unity skill install cursor --local`), not an MCP relay.
- Do not commit, push, or change branches unless the user explicitly asks.
- When the same path exists in reference and target, **newer overwrites older** — do not replace a newer target file with an older reference copy.

## Modification times

Before copying or overwriting any file that exists in both reference and target:

1. Compare last-modified timestamps on disk (`stat`, `ls -lt`, or equivalent — do not rely on git history alone).
2. **Missing in target** — copy from reference.
3. **Both exist, reference newer** — copy or merge reference content into target so recent reference edits replace stale target copies.
4. **Both exist, target newer** — skip overwrite; note in output that the project copy is ahead of reference.
5. **Timestamps within ~1 minute** — diff both versions and ask the user before overwriting.
6. Report which side was newer for each updated or skipped pair in the output.

## Steps

1. Resolve source and target:
   - Find `_reference_ide-setup` in the workspace or as a sibling repo.
   - Identify the target repo from the `/update-agent-tooling` context, or default to the primary repo in the workspace.
   - If either repo is ambiguous or missing, ask for clarification before editing.

2. Determine the environment:
   - Prefer an explicit environment named after the command.
   - Otherwise inspect project files, existing `.cursor/rules/`, README files, build files, and package metadata.
   - If the project type is still unclear, ask before copying environment-specific tooling.

3. Compare tooling:
   - **Cursor:** Check `shared/.cursor/commands/`, `shared/.cursor/skills/`, `shared/.cursor/plugins/`, plus any dependent shared docs, scripts, templates, or rules.
   - **Devin:** Check `shared/.devin/skills/` and `shared/.devin/config.json`, plus environment-specific `.devin/skills/` and `.devin/config.json`.
   - Check the same paths under the matching environment folder.
   - Compare against the target repo's `.cursor/commands/`, `.cursor/skills/`, `.cursor/plugins/`, `.devin/skills/`, `.devin/config.json`, `docs/`, `scripts/`, and `templates/` as applicable.
   - For each paired path, compare modification times per **Modification times** above and note which side is newer before editing.
   - For MCP: there is no shared ClickUp MCP JSON to sync. Mention the ClickUp setup doc if relevant. Only plan a project merge for an environment-bound server when that environment still ships one and it is missing. Do not add a Unity MCP relay.

4. Copy and update relevant items:
   - Create target directories only when needed.
   - Apply **Modification times** for every file: copy missing files from `shared/` first, then from the environment folder; update target files only when the reference copy is newer.
   - Copy Cursor tooling to the target's `.cursor/` and Devin tooling to the target's `.devin/`.
   - Copy `.devin/config.json` only when missing in the target; if the target already has one, note it and skip to avoid clobbering project-specific edits.
   - **Do not** create or copy a ClickUp project `mcp.json` or `.devin/mcp_config.json` from shared (it does not exist). If ClickUp is already on global MCP, nothing to do for local; for Cloud Agents, use the agents dashboard.
   - If merging project-bound MCP from an environment folder, merge carefully instead of replacing existing servers when the target file is newer.
   - Preserve project-specific placeholders and filled-in values when the target file is newer or when merging. If a copied template contains placeholders, list them for the user to fill in.

5. Verify:
   - Re-read the copied or merged files.
   - Run a read-only status/diff check to summarize what changed.
   - Do not build or deploy for Cursor-tooling-only changes.

## Output

When done, show:
- Target repo and detected environment
- Cursor shared tooling added or already present
- Devin shared tooling added or already present
- Environment-specific Cursor tooling added or already present
- Environment-specific Devin tooling added or already present
- MCP notes: skipped as reference (default), already covered by global MCP, dashboard needed for Cloud Agents, or merged (and why)
- Plugin merge notes
- Any skipped files, conflicts, or placeholders that need user input
