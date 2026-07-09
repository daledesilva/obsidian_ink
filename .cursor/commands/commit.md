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
<past-tense verb>: <message>

Clickup Task: <id>
EOF
)"
```

5. Push: `git push` (or `git push -u origin <branch>` if no upstream is set). Report the result.

6. Run `git status` after push to confirm a clean state.

## Commit message format

**Prefix:** Start with an accurate past-tense verb, lowercase, followed by a colon and space (e.g. `added:`, `updated:`, `fixed:`, `redesigned:`, `removed:`).

**Body:** Write 1–2 sentences describing the conceptual what, with emphasis on why. Each sentence after the prefix must start with a past-tense verb and remain entirely in past tense. Use active voice where natural.

**Avoid:**
- Passive openings (`was dropped`, `was added`)
- Imperatives (`Fix`, `Rebound`, `Update`)
- Present tense (`persists`, `allows`, `fixes`)
- File lists or line-level diffs unless that is the conceptual what

**ClickUp line (optional):** When a ClickUp task is relevant and known, add a blank line after the body, then:

```
Clickup Task: <ClickUp-task-ID>
```

Use a task ID from: text after `/commit`, the current conversation, or the branch name if it embeds one. Omit the ClickUp line if no task is known.

**Example:**

```
fixed: Dropped hand tracking input during scene transitions because the OVRHand reference was destroyed on load. Rebounded the reference in Awake so input persisted across scenes.

Clickup Task: 86abc1234
```

## Output

When done, show:
- The commit message used
- Commit hash
- Push result (remote and branch)
- Any warnings (secrets skipped, no upstream, push rejected, etc.)
