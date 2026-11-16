# Git Workflow

## Branch Naming

Format: `<prefix>/<short-description>` in kebab-case.

Valid prefixes:

| Prefix | Use for |
|---|---|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation only changes |
| `refactor/` | Code restructuring without behaviour change |
| `chore/` | Maintenance, deps, tooling |
| `experiment/` | Exploratory or throwaway work |

Rules:
- Lowercase only
- Hyphens separate words, underscores separate categories where necessary. Higher level categories first (eg. feat/ui-revamp_colour-updates)
- Keep descriptions concise and meaningful

## Branch Lifecycle

Delete branches immediately after they are merged to `main`. Do not let stale branches accumulate.

## AI Commit Policy

Never commit, push, amend, rebase, reset, or otherwise modify git history or branches unless the user explicitly asks for it in their message. Staging and local file edits are fine; any action that would create or change a git commit or branch requires explicit instruction.

When committing, follow the message format and safety protocol in `committing-changes-with-git.md`. For commit-and-push in one step, invoke the `/commit` skill. For opening a PR, invoke `/pr`.
