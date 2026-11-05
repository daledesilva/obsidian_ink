# Cursor Git And Workflow Command Setup

Reference for commit message format, shared workflow rules, and common slash commands.

In this repo the commands live in `.cursor/commands/`. `/commit` uses the short format below and ignores the 1–2 sentence body in `.cursor/rules/committing-changes-with-git.mdc`. Refresh shared copies from the sibling `_common_ide-setup` with `/update-agent-tooling` (`shared/` plus `obsidian-plugin/`). See [Agent tooling](agent-tooling.md).

## Artifacts

| Artifact | Location | Purpose |
|---|---|---|
| **Commit rule** | User Rule (Settings → Rules) or `.cursor/rules/committing-changes-with-git.mdc` | Agent commit behavior when asked to commit (does **not** push unless explicitly asked) |
| **`/commit` command** | `~/.cursor/commands/commit.md` (global) or `.cursor/commands/commit.md` (project) | Explicit workflow: stage → commit → **push** |
| **`/pr` command** | `~/.cursor/commands/pr.md` (global) or `.cursor/commands/pr.md` (project) | Explicit workflow: inspect branch changes, push if needed, and open a pull request |
| **`/document` command** | `~/.cursor/commands/document.md` (global) or `.cursor/commands/document.md` (project) | Explicit workflow: document current-thread feature work and add context comments |
| **`/update-user-docs` command** | `~/.cursor/commands/update-user-docs.md` (global) or `.cursor/commands/update-user-docs.md` (project) | Explicit workflow: update ClickUp **User Documentation** (External Docs) and **support playbooks** (Internal Docs) from a space/folder/doc link |
| **`/build-ready-tasks` command** | `~/.cursor/commands/build-ready-tasks.md` (global) or `.cursor/commands/build-ready-tasks.md` (project) | Explicit workflow: pull ClickUp Ready-column tickets with type Build from a list, batch small/simple work into few PRs (own PR only for complex, risky, large, or clear themes), wrap multi-ticket groups under a new In Progress parent with the originals as subtasks, implement, commit, push |
| **Documentation/context comments rule** | `.cursor/rules/documentation-and-context-comments.mdc` | Shared rule for when to update docs and when to add code comments that explain intent |
| **ClickUp rule** | `.cursor/rules/clickup.mdc` | Task folder scope; feeds `Clickup Task:` line in commits; `/build-ready-tasks` grouping + REST reparent via `~/.zshenv` |
| **ClickUp MCP / T3 Code / reparent doc** | `docs/cursor-mcp-clickup-cloud-agents.md` (from `shared/docs/`) | Official MCP URL, Rank 1 `${env:CLICKUP_API_TOKEN}` + `x-workspace-id` + OS GUI environment bridge (macOS, Windows, Linux) for T3 Code & Cursor, and what to tell the user if subtask nesting stops working |
| **Git workflow** | `.cursor/rules/git-workflow.mdc` | Branch naming and AI commit policy |

## Rule vs command

| Behavior | Commit rule | `/commit` command |
|---|---|---|
| Triggers | User asks Agent to commit | User types `/commit` in Agent chat |
| Commits | Yes | Yes |
| Pushes | No (unless explicitly asked) | Yes (always) |
| Optional context | N/A | `/commit 86abc1234` for ClickUp task ID |

The Source Control sparkle button (**Generate commit message**) does not read rules or commands.

## Commit message format

Asking an agent to commit, without `/commit`, follows `.cursor/rules/committing-changes-with-git.mdc`: a lowercase past-tense prefix and one or two past-tense sentences.

`/commit` replaces that body. The first line is at most 20 words, including the prefix. Extra facts use one marker line each. Skip marker lines when the first line is enough.

```
<past-tense-verb>: <at most 20 words on this line>

+ <added>
- <removed>
> <modified>

Clickup Task: <ClickUp-task-ID>   ← optional; blank line before it
```

### Grammar

- **Prefix:** lowercase past-tense verb + `: ` — e.g. `added:`, `updated:`, `fixed:`, `removed:`
- **`/commit` first line:** what changed and why, cut to 20 words. Do not continue the sentence on the next line.
- **Marker lines:** `+` added, `-` removed, `>` modified. No other use of those markers.
- **Avoid:** passive openings (`was dropped`), imperatives (`Fix`, `Update`), a second prose sentence under the first line, file lists

### Example (`/commit`)

```
fixed: Kept hand tracking across scene loads

> Rebounded the OVRHand reference in Awake

Clickup Task: 86abc1234
```

## Setup checklist (new repo)

1. Add `_reference_ide-setup` to the workspace (clone, submodule, or sibling folder)
2. Copy **`shared/`** and the matching **environment folder** (e.g. `android-native/`, `react-native/`, `unity-mixed-reality/`) into the target project
3. Merge `.cursor/rules/`, `.cursor/commands/`, and environment-specific `.cursor/` subtrees into the project's `.cursor/`
4. Copy environment `docs/` and `scripts/` to the project root when applicable
5. Fill in template placeholders — see root `README.md` and `shared/.cursor/rules/project-overview.mdc`, `tech-stack.mdc`, `clickup.mdc`
6. Add **Committing changes with git** as a User Rule — copy text from `committing-changes-with-git.mdc`, or use the file as a project rule
7. Copy `shared/.cursor/commands/*.md` to the project, or to `~/.cursor/commands/` for all repos
8. Test: ask Agent to commit → should not push
9. Test: `/commit` → should commit and push

## Global vs project placement

| File | Global (`~/.cursor/`) | Project (`.cursor/`) |
|---|---|---|
| `commands/{commit,pr,document,build-ready-tasks}.md` | All repos on this machine | Shared with team via git |
| User Rule (commit format) | Recommended | Optional duplicate as project rule |
