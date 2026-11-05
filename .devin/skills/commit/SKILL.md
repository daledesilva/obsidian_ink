---
name: commit
description: Commit and push
triggers:
  - user
allowed-tools:
  - read
  - exec
  - write
  - edit
  - mcp_call_tool
---
# Commit and push

Stage all relevant changes, write a commit message in the required format, commit, and push to the remote.

Any text after `/commit` is optional context — e.g. a ClickUp task ID (`/commit 86abc1234`) or a hint about what changed.

If any files have changed or gone missing since your last edits, ignore them because the user probably changed them on purpose. Do not redo anything — just commit the files as they are.

## Git safety

- NEVER update the git config
- NEVER run destructive/irreversible git commands (push --force, hard reset, etc.)
- NEVER skip hooks (--no-verify, --no-gpg-sign, etc.)
- NEVER force push to main/master — warn and stop if the push would require it
- Avoid `git commit --amend` unless the user explicitly invoked `/commit` again to amend a commit you just created in this conversation that has not been pushed
- Do not commit files that likely contain secrets (.env, credentials.json, etc.) — warn and exclude them
- Never use git commands with the `-i` flag
- If there are no changes to commit, report that and stop — do not create an empty commit

## Steps

1. Run in parallel:
   - `git status` — see untracked and modified files
   - `git diff` and `git diff --staged` — understand the full change set
   - `git log -5 --oneline` — recent message context
   - `git branch -vv` — confirm upstream tracking branch for push

2. Stage all relevant changes (`git add` for modified/untracked files that belong in this commit). Do not stage secret or generated junk unless the user clearly intended it.

3. Draft the commit message using the format below.

4. Commit using a HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
<past-tense verb>: <at most 20 words total on this line>

+ <added>
- <removed>
> <modified>

Clickup Task: <id>
EOF
)"
```

5. Push: `git push` (or `git push -u origin <branch>` if no upstream is set). Report the result.

6. Run `git status` after push to confirm a clean state.

## Commit message format

This format replaces the 1–2 sentence body in `committing-changes-with-git.mdc` whenever `/commit` is used.

**First line:** One short summary, at most 20 words, counting every word on that line including the prefix. Start with an accurate past-tense verb, lowercase, then a colon and space (e.g. `added:`, `updated:`, `fixed:`, `removed:`). Say what changed and why in that one line. If it does not fit, cut the line — do not spill into a second sentence.

**Detail lines:** Add these only when the first line leaves out something a reader needs. One fact per line. The first character is the marker, then a space:

- `+` something added
- `-` something removed
- `>` something modified

Do not use `+`, `-`, or `>` for any other kind of line. Skip detail lines when the first line is enough.

**Avoid:**
- A first line longer than 20 words
- A second prose sentence on the first line or immediately under it
- Passive openings (`was dropped`, `was added`)
- Imperatives (`Fix`, `Rebound`, `Update`)
- File lists or line-level diffs unless that is the conceptual what

**ClickUp line (optional):** When a ClickUp task is relevant and known, add a blank line after the summary and any detail lines, then:

```
Clickup Task: <ClickUp-task-ID>
```

Use a task ID from: text after `/commit`, the current conversation, or the branch name if it embeds one. Omit the ClickUp line if no task is known.

**Example:**

```
fixed: Kept hand tracking across scene loads

> Rebounded the OVRHand reference in Awake

Clickup Task: 86abc1234
```

## Output

When done, show:
- The commit message used
- Commit hash
- Push result (remote and branch)
- Any warnings (secrets skipped, no upstream, push rejected, etc.)
