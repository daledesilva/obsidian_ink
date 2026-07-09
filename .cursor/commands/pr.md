# Create pull request

Push the current branch (if needed) and open a pull request into the default base branch (usually `main`) using `gh`.

Any text after `/pr` is optional context — e.g. a ClickUp task ID (`/pr 86abc1234`), a target base branch hint, or a note about what the PR covers.

## Git safety

- NEVER update the git config
- NEVER run destructive/irreversible git commands (push --force, hard reset, etc.)
- NEVER skip hooks (--no-verify, --no-gpg-sign, etc.)
- NEVER force push to main/master — warn and stop if the push would require it
- Do not commit as part of `/pr` — if there are uncommitted changes, warn and stop (use `/commit` first)
- Never use git commands with the `-i` flag
- If the branch has no commits ahead of the base branch, report that and stop — do not open an empty PR

## Steps

1. Run in parallel:
   - `git status` — confirm working tree is clean (or only allow untracked files the user clearly intends to exclude)
   - `git branch -vv` — current branch and upstream tracking
   - `gh repo view --json defaultBranchRef,nameWithOwner` — default base branch and repo
   - Resolve the merge-base base branch: use text after `/pr` if it names a base (e.g. `into develop`); otherwise use the repo default (`main` / `master`)
   - `git log --oneline <base>...HEAD` — commits included in the PR
   - `git diff <base>...HEAD` — full change set for the conceptual summary
   - `gh pr view --json url,number,state 2>/dev/null` or `gh pr list --head $(git branch --show-current) --json url,number,state` — check for an existing PR on this branch

2. If uncommitted tracked changes exist, stop and tell the user to `/commit` first.

3. If a PR already exists for this branch, report its URL and stop unless the user clearly asked to update it.

4. Collect **ClickUp task IDs** from (dedupe, preserve order):
   - Text after `/pr`
   - The current conversation
   - The branch name (e.g. `feat/86abc1234-short-desc`)
   - Commit bodies on `<base>...HEAD` — lines matching `Clickup Task: <id>` (case-insensitive)

5. For each ClickUp task ID, resolve link and title:
   - Prefer **ClickUp MCP** `clickup_get_task` when available — use the task `url` and `name` from the response
   - If MCP is unavailable or lookup fails, use fallback URL `https://app.clickup.com/t/<task_id>` and title `<task_id>`

6. Draft the PR:
   - **Title:** One concise line — conceptual what changed, not a file list. Prefer the dominant theme across commits; use `/pr` hint text when provided.
   - **Body:** Use the format below. Summary bullets must describe **why** and **what** at a conceptual level (not a file manifest). Commits list must include **every** commit on `<base>...HEAD`, newest first or oldest first — pick oldest-first ( chronological ) so readers follow the story.

7. Push if needed: `git push` or `git push -u origin <branch>` when no upstream is set. Stop on push failure.

8. Create the PR:

```bash
gh pr create --base <base> --head <branch> --title "<title>" --body "$(cat <<'EOF'
<body>
EOF
)"
```

9. After the PR is created, move each linked ClickUp task to the list's **Review** status/column:
   - Resolve the exact Review status when needed.
   - Prefer **ClickUp MCP** `clickup_update_task` with `status`.
   - Leave tasks unchanged if they are already in Review or a later review/done status.
   - If MCP is unavailable or the Review status cannot be resolved, report that clearly and ask the user to move the task manually.

10. Report the PR URL, title, base branch, commit count, ClickUp tasks linked, ClickUp tasks moved to Review, and any warnings (no ClickUp tasks found, MCP unavailable, skipped push, status update failed, etc.).

## PR body format

```markdown
## Summary

- <Conceptual bullet — what changed and why>
- <Additional bullet if needed; usually 1–3 bullets total>

## Commits

- `<short-hash>` — <full first line of commit message>
- `<short-hash>` — <full first line of commit message>

## ClickUp

- [<task name>](<task url>) — `<task id>`
```

**Summary:** Past tense, conceptual, emphasis on why. No file lists or line-level diffs unless essential to explain the change.

**Commits:** One line per commit from `git log <base>...HEAD`. Use the abbreviated hash from `--oneline` (or `git log --format=%h`).

**ClickUp:** One line per linked task with markdown link, display name, and task ID in backticks. If no task IDs were found, replace the section with:

```markdown
## ClickUp

None linked.
```

## Optional test plan

Add a `## Test plan` section **only** when the change has non-obvious verification steps (user flows, device testing, regression areas). Keep it a short checklist.

## Output

When done, show:
- PR URL
- PR title
- Base ← head branches
- Number of commits included
- ClickUp tasks linked (IDs + URLs)
- ClickUp tasks moved to Review (IDs + status), or why they were not moved
- Any warnings
