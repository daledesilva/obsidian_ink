# Build ready tasks

Implement ClickUp tickets from one or more lists' `Ready` column that have ticket type `Build`, batched into as few reviewable pull requests as practical (see PR batching bias below). Feature branches and independent PRs use the list-aligned release branch (`release_<version>` from each list name), not `main`.

Any text after `/build-ready-tasks` must be a ClickUp list URL or list ID, or a ClickUp folder URL or folder ID (a folder may contain several lists to check).

## Safety

- Use the ClickUp MCP server for ClickUp reads and updates except **reparenting an existing task** (see **Convert grouped tickets into subtasks**). Before the first MCP call, read the relevant tool descriptors for `clickup_get_list`, `clickup_get_folder`, `clickup_get_workspace_hierarchy`, `clickup_filter_tasks`, `clickup_get_task`, `clickup_get_custom_fields`, `clickup_create_task`, `clickup_update_task`, and `clickup_delete_task`.
- Do not use browser automation as a fallback for missing ClickUp MCP support.
- Do not start if the current git working tree has uncommitted tracked changes or unrelated untracked files. Ask the user whether to commit, stash, or remove them first.
- Never update git config, skip hooks, force push, use interactive git commands, reset, rebase, or amend unless the user explicitly asks.
- Treat this command as explicit approval to create branches, implement work, commit, push, and open PRs for the selected Ready + Build tickets only.
- Stop the workflow on the first unresolved implementation, test, push, PR, or ClickUp blocker. Report the completed PRs, remaining groups, and the blocker.

## PR host repo (forks)

Always open PRs against the repository that **`origin`** points to (this checkout / your account), **not** against an `upstream` parent unless the user explicitly asks to contribute upstream.

Resolve once before the first `gh pr create` (and reuse for the whole run):

```bash
ORIGIN_URL=$(git remote get-url origin)
ORIGIN_REPO=$(printf '%s\n' "$ORIGIN_URL" | sed -E 's#^git@[^:]+:##; s#^https?://[^/]+/##; s#\.git$##; s#/$##')
```

- Pass `--repo "$ORIGIN_REPO"` on every `gh pr create` / `gh pr list` / `gh pr view` / `gh repo view` used for PR targeting.
- Do **not** choose the host from bare `gh repo view` or `gh pr create` with no repo argument — on forks that often selects the **parent** (`upstream`).
- After each create, confirm the PR URL’s `owner/name` matches `$ORIGIN_REPO` before writing it to ClickUp.

## Resolve the Ready Build tickets

1. Parse the text after `/build-ready-tasks`.
   - If it is missing, ask for a ClickUp list or folder URL or ID and stop.
   - If it is a URL, decide whether it targets a **list** or a **folder** from the path when possible (e.g. `/li/` or list-segment vs `/f/` or folder-segment). Extract the corresponding ID when present.
   - If the URL cannot be classified or the ID cannot be extracted, ask for a clear list or folder ID and stop.
   - If the input is a bare ID (not a URL), try `clickup_get_list` first; if that fails, try `clickup_get_folder`. If both fail, ask the user to clarify and stop.

2. Resolve the target into one or more lists to check:

   **List target**
   - Use `clickup_get_list` with `list_id` (or `list_name` when the input is clearly a list name).
   - The workflow has exactly one list to process.

   **Folder target**
   - Use `clickup_get_folder` with `folder_id` (or `folder_name` + space when the input is clearly a folder name) to confirm the folder.
   - Discover every list in that folder via `clickup_get_workspace_hierarchy` (`max_depth: "2"`, scoped with `space_ids` when known) or another ClickUp MCP path that returns the folder’s lists. Paginate until all lists are collected.
   - Skip lists that are clearly backlog / reference-only (e.g. name contains `Backlog`, ignoring case), or that `clickup.mdc` marks as reference-only. Report them as skipped.
   - If the folder has no remaining lists after skips, report that and stop.
   - Process every remaining list in the folder independently (see multi-list rules below). Do not require the user to pick a single list.

3. For each list to process, resolve its release base branch from the list name.
   - Every group branched and every independent PR opened for that list must use the release branch that aligns with **that list’s** name — not the repo default (`main` / `master`).
   - From the list name, extract the version token: the last whitespace-separated segment that looks like a dotted version (e.g. `0.4`, `1.2.3`). Strip a trailing colon or similar punctuation from that token if present.
   - Examples: list `xyz 0.4` → `release_0.4`; list `Sl: 1.0` → `release_1.0`; list `Product 1.2.0` → `release_1.2.0`.
   - The base branch name is always `release_<version>` (underscore after `release`, no other separators).
   - Confirm that branch exists on the remote (fetch if needed, then `git rev-parse --verify origin/release_<version>` or equivalent).
   - If no version token can be extracted from the list name: for a **single-list** target, report and stop; for a **folder** target, skip that list, report why, and continue with other lists.
   - If `origin/release_<version>` does not exist: for a **single-list** target, report and stop; for a **folder** target, skip that list, report why, and continue. Never fall back to `main` or create the release branch.

4. For each remaining list, inspect configured statuses.
   - Match the status named `Ready`, ignoring only case and surrounding whitespace.
   - **Single-list target:** if no matching status exists, say exactly: `There is no ready column` — then do nothing else.
   - **Folder target:** if a list has no Ready status, skip that list, report it, and continue with other lists. If every list is skipped this way, say exactly: `There is no ready column` and stop.

5. For each list that has Ready, retrieve every task with that status.
   - Use `clickup_filter_tasks` with `list_ids: [<list id>]`, `statuses: [<exact Ready status>]`, `include_closed: false`, and `subtasks: true`.
   - Paginate until all matching tasks are collected.
   - If a list has no Ready tasks, record that and continue (folder) or stop (single list with nothing left to do).

6. Keep only tickets with ticket type `Build`.
   - For each Ready task, use `clickup_get_task` (or inspect `task_type` / `taskType` from the filter payload when present).
   - Include a task only when its ticket type is `Build`, ignoring only case and surrounding whitespace.
   - Do not implement Ready tickets of any other type (or with no type). Report them as skipped with their type.
   - If no Ready + Build tickets remain across all lists being processed, report that and stop.

7. For each Ready + Build task, fetch implementation context:
   - Use `clickup_get_task` with `include: ["dependencies", "linked_tasks", "subtasks", "description", "checklists", "custom_fields"]` and `expand_statuses: true`.
   - Record task ID, custom ID, title, URL, description summary, status, task type, **source list id/name**, dependencies, linked tasks, subtasks, checklist size, priority, estimate if available, available statuses, and custom fields (including the `PR` field when present).

8. Resolve the workspace/list `PR` custom field once for later updates:
   - Use `clickup_get_custom_fields` (list, folder, space, and/or `include_workspace: true` as needed).
   - Match the field named `PR`, ignoring only case and surrounding whitespace.
   - Prefer a URL-type field when more than one match exists.
   - If no `PR` field exists, continue the workflow but report that PR links cannot be saved on tickets.

### Multi-list (folder) rules

- Treat each list’s Ready + Build set as tied to that list’s `release_<version>` base branch.
- Never put tickets from different release base branches into the same PR group.
- Prefer processing lists in ascending version order when versions are comparable; otherwise use a stable, reported order.
- Batching bias still applies **within** a single list / single release base. Across lists that share the same resolved `release_<version>`, batching across those lists is allowed when it stays reviewable; prefer keeping one list’s work together when uncertain.

## Build the implementation plan

Create a dependency graph using only the Ready + Build tasks as in-scope implementation nodes.

- A task with no in-scope blockers is a base dependency.
- A task blocked by another Ready + Build task must not be implemented before its blocker.
- If a task is blocked by a task outside the Ready + Build set, report the external blocker. Do not implement that task unless the dependency is clearly informational or already complete.
- If a dependency cycle exists, report the cycle and stop.

### PR batching bias (default: fewer PRs)

Prefer **one PR for many small, simple tickets**. Do not open a PR per ticket or per minor feature area. Too many small PRs is worse than one reviewable batch of simple work.

**Own PR only when justified:**

| Put in its own PR when… | Otherwise… |
|---|---|
| The change is **complex** (multiple subsystems, non-obvious design, hard to review in a mixed batch) | Bundle with other small/simple Ready + Build work |
| The change is **risky** (migrations, data loss risk, launcher/default-home behavior, security, broad user-facing regressions) | Bundle |
| The change is **simple but large** (high file/line volume, many touch points, long test plan even if each piece is easy) | Bundle other small work separately |
| A **theme cluster** has enough related tickets to stand alone (e.g. several UI cosmetic updates, accessibility polish, copy tweaks) | Prefer one themed PR for that cluster, not one PR per ticket |

**Default bucket:** All remaining small, simple, low-risk tickets **that share the same release base branch** go into **one shared PR**, even when they touch different files or light feature areas, as long as the combined test plan stays short and reviewable.

Classify each task before grouping:

- **Small / simple:** Low risk, limited scope, easy to verify. Default destination is the shared small-work PR (or a theme cluster PR when a clear theme has enough tickets).
- **Complex or risky:** Gets its own PR.
- **Simple but large:** Gets its own PR because of volume, not difficulty.
- **Base dependency:** Unlocks other Ready + Build work. Small base deps join the shared small-work (or theme) PR when possible; large/risky base deps get their own PR and may require stacking.
- **Blocked:** Has unresolved blockers outside the current Ready + Build plan.

Group tasks in implementation order:

1. Partition work by release base branch first (`release_<version>`). Never mix different bases in one PR.
2. Within each release base, start from the bias above: plan the **minimum number of PRs** that still keep complex/risky/large work isolatable.
3. Put unavoidable base dependencies first.
   - Fold small base deps into the shared small-work PR (or an early theme PR) when they unlock later work in that same PR.
   - Put a large or risky base dependency in its own PR.
4. Batch all other small/simple tickets into one PR unless a theme cluster is large enough to deserve its own PR (still one PR for the whole theme, not one per ticket).
5. Give each complex, risky, or simple-but-large ticket its own PR.
6. Split only when a candidate group would make review hard: hard-to-reason interactions across unrelated risky flows, a test plan that is too long to verify in one pass, or dependency ordering that requires a separate merge. Do **not** split merely because tickets are unrelated-but-simple.
7. Prefer stacked PRs when later groups depend on unmerged code from earlier groups **on the same release base**:
   - Branch dependent groups from the prerequisite branch.
   - Open the dependent PR with the prerequisite branch as its base.
   - Report the intended merge order.

Before implementing, show a short plan with:

- The ClickUp target (list or folder name/id)
- For each list being processed: list name, Ready status, and resolved release base branch (`release_<version>`)
- Any lists skipped (backlog, no Ready, no version, missing release branch, no Ready + Build) and why
- The ordered PR groups (and a one-line reason each group is separate, e.g. `shared small fixes`, `risky Room migration`, `UI cosmetics theme`), each tagged with its release base
- The tickets in each group
- For each multi-ticket group, the intended grouping-parent title (the kind of work in that PR), or **original-ticket fallback** if `CLICKUP_API_TOKEN` is missing
- Which groups are stacked on earlier groups
- Any blocked or skipped tickets and why (including Ready tickets skipped for non-Build type)

Proceed without asking for extra confirmation unless the plan has ambiguity that could change the code architecture or release order.

## Grouped PR parent task

When a PR group contains **two or more** Ready + Build tickets **and nesting will succeed**, do **not** move those tickets into In Progress or Review as independent list items. Create one grouping parent for the PR and **move** the existing tickets under it as subtasks so they keep their IDs, comments, activity, and history.

When a PR group contains **exactly one** ticket, skip the grouping parent. Move that single ticket to In Progress, then to Review with the `PR` field.

### Fallback when nesting cannot run (no wrapper)

**Do not create a grouping parent** unless you can nest the original tickets under it in the same step. If nesting cannot run or fails, leave the board as the original tickets and treat the group the old way:

- Move **each original ticket** to In Progress (or equivalent) before implementation.
- After the PR exists, move **each original ticket** to Review and set **each** `PR` field to the PR URL.
- Do not leave an empty wrapper task on the list. If a parent was already created and nesting then failed, delete that parent with `clickup_delete_task` before continuing.
- Still implement, commit, push, and open the one batched PR. Report that the group used the original-ticket fallback and tell the user the **If nesting stops working** checklist so they can fix the token for next time.

Check `CLICKUP_API_TOKEN` (or `CLICKUP_API_KEY`) **before** `clickup_create_task`. Missing token → fallback immediately; do not create the parent first.

### Create the parent (start of a multi-ticket group, nesting only)

After the branch exists, the token is present, and before implementation:

1. Create a new task with `clickup_create_task` in the group's home list (`list_id` of the grouped tickets). If the group spans lists that share a release base, use the list that holds most of the tickets and report that.
2. Set `status` to the list's active-work status (`In Progress` or equivalent). If no active-work status exists, create the parent anyway, leave status unchanged, and report that.
3. Set `task_type` to `Build` when that type exists in the workspace.
4. Name it for the kind of work in the PR (the group's one-line reason), not a dump of ticket IDs. Examples: `Shared small home-grid fixes`, `App list search polish`.
5. Set `markdown_description` to a short validation list for that PR:

```markdown
## Validate on PR

- <succinct check a reviewer or QA should run>
```

   Draft the bullets from the grouped tickets. Update the description after implementation if the real test plan changed. Keep it succinct — not a restatement of every ticket body.

6. Immediately nest the originals (next subsection). Do **not** use `clickup_merge_tasks` (it consumes and deletes source tasks). Do **not** delete grouped tickets and recreate them as subtasks.

### Convert grouped tickets into subtasks (preserve history)

Official ClickUp MCP `clickup_update_task` **does not accept `parent`**. Extra `parent` arguments are stripped (a parent-only update errors with “at least one field”, and combining `parent` with another field only applies the allowed fields). Do **not** treat a successful status/name update as a successful reparent. Do **not** switch to unofficial ClickUp MCP servers to work around this.

Reparent with ClickUp REST **Update Task**, which does support `parent` on an existing task and keeps the same task ID, comments, and history.

1. Resolve a ClickUp **personal API token** from the environment: `CLICKUP_API_TOKEN`, or `CLICKUP_API_KEY` if that is unset. Do not read tokens from git-tracked files. If unset, `source ~/.zshenv` in the same shell (do not print the token) and check again — Cursor Agent Shell often does not inherit `~/.zshenv` until sourced. If still unset, **do not create a parent** — use **Fallback when nesting cannot run**.
2. If a grouped ticket is already a subtask of a **different** parent, do not steal it. Exclude it from this wrap, report it, and continue with the remaining tickets (or use the fallback if that would change the PR plan).
3. For each remaining grouped ticket, call REST (do not print the token). Personal tokens are sent as the raw `pk_…` value, not `Bearer`:

```bash
curl -sS -X PUT "https://api.clickup.com/api/v2/task/<task_id>" \
  -H "Authorization: ${CLICKUP_API_TOKEN:-$CLICKUP_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"parent":"<parent_task_id>"}'
```

   Do not change that ticket's status in the same request. If the project has `scripts/clickup-set-parent.sh`, you may use that instead of inlined `curl`.
4. Confirm with `clickup_get_task` on the parent (`include: ["subtasks"]`) **and** on each child (`parent` must equal the grouping parent id). A child whose `parent` is still `null` is not nested — do not assume MCP did it.
5. Leave successfully nested tickets' statuses unchanged. They must not be independently moved to In Progress or Review.
6. If reparenting fails for any ticket that should be nested: delete the unused parent (`clickup_delete_task`), do not recreate tickets, switch to **Fallback when nesting cannot run**, report the REST error (missing token vs HTTP failure), and tell the user the **If nesting stops working** checklist. Continue the PR on the original tickets.

### After the PR exists (multi-ticket group)

**Nesting succeeded**

1. Move **only the grouping parent** to Review (leave unchanged if already Review or later).
2. Set the `PR` custom field on **the grouping parent** to the PR URL.
3. Do not move nested tickets to Review and do not require the `PR` field on nested tickets.
4. If Review or the `PR` field cannot be set on the parent, report that and ask the user to finish those steps on the parent task.

**Fallback (no parent)**

1. Move **each original ticket** to Review (leave unchanged if already Review or later).
2. Set the `PR` custom field on **each original ticket** to the PR URL.

## Implement each group

For each group, complete the full loop before starting the next group:

1. Prepare the branch.
   - Confirm the working tree is clean.
   - Use that group’s list-aligned release branch (`release_<version>`) as the base for independent groups. Do not use the repo default (`main` / `master`).
   - Fetch that release branch if needed, then create the feature branch from `origin/release_<version>`.
   - For dependent / stacked groups, create the branch from the prerequisite group branch (which itself ultimately comes from the same release branch).
   - Name the branch using `git-workflow.mdc`, with the dominant prefix and a short description. Include a task ID when it helps traceability.

2. Record the group on ClickUp.
   - **One ticket:** Resolve an active-work status such as `In Progress` and use `clickup_update_task` to move that ticket there. If no active-work status exists, leave it unchanged and report that.
   - **Two or more tickets, nesting will succeed:** Follow **Grouped PR parent task** — create the In Progress parent and nest the existing tickets as subtasks. Do not independently move those tickets to In Progress.
   - **Two or more tickets, nesting cannot run:** Use **Fallback when nesting cannot run** — no parent task. Move each original ticket to In Progress.

3. Implement the group.
   - Use the ticket descriptions, dependencies, and codebase as source material.
   - Keep the edit scope limited to the group.
   - Do not include unrelated cleanup.
   - Add or update tests only when the ticket explicitly calls for them or the repo's rules require them.

4. Verify the group.
   - Run relevant tests, lint, build, or manual verification for the changed code.
   - If verification requires a user-started app, service, or manual environment, stop and ask instead of starting it yourself.
   - If verification fails, fix and rerun before committing.

5. Commit the group.
   - Stage only files relevant to the group.
   - Use the required HEREDOC commit format.
   - Write one conceptual past-tense message.
   - Add one `Clickup Task: <id>` line for each original ticket in the group. For a multi-ticket group **with a nesting parent**, also add a line for the grouping parent.

6. Push and open the PR.
   - Push the branch with upstream tracking on **`origin`** if needed (`git push -u origin HEAD`).
   - Create the PR with `gh pr create --repo "$ORIGIN_REPO" …` (see **PR host repo**).
   - Use the group’s list-aligned release branch (`release_<version>`) as `--base` for independent groups.
   - Use the prerequisite group branch as `--base` for stacked groups.
   - Confirm the PR URL host matches `$ORIGIN_REPO` before ClickUp updates.

7. Move the reviewable ClickUp task to Review and save the PR link.
   - Resolve the `Review` status from the task's available statuses.
   - **One ticket, or multi-ticket fallback:** After the PR exists, use `clickup_update_task` on **each original ticket** to move it to Review (leave unchanged if already Review or later) and set its `PR` custom field to the PR URL (`custom_fields: [{ id: <PR field id>, value: <PR URL> }]`).
   - **Two or more tickets with a nesting parent:** After the PR exists, update **only the grouping parent** to Review and set **its** `PR` custom field to the PR URL. Leave nested tickets' statuses and `PR` fields unchanged.
   - If no Review status exists, still save the `PR` field on the reviewable task(s) when possible, leave status unchanged, and report that status movement was skipped.
   - If the `PR` field could not be resolved or the update fails, report that clearly and ask the user to paste the PR URL on those reviewable task(s) manually.

8. Report progress for the group:
   - Source list name(s)
   - Branch
   - Commit hash
   - PR URL and base branch
   - Tickets included
   - Grouping parent task (id, url, title) when one was created, and which tickets were nested under it
   - Tests or verification run
   - ClickUp status changes
   - Whether the `PR` custom field was updated on the reviewable task (parent or single ticket)

## PR body format

For a **multi-ticket** group:

```markdown
## Summary

- <What changed and why>

## ClickUp

- **PR parent:** [<parent name>](<parent url>) - `<parent id>` (list: `<list name>`)
  - [<task name>](<task url>) - `<task id>`

## Test plan

- [x] <verification command or manual check>

## Stack

Base: `<base branch>`
Depends on: `<prior PR URL or none>`
```

For a **one-ticket** group, use a flat ClickUp line instead of a parent:

```markdown
## ClickUp

- [<task name>](<task url>) - `<task id>` (list: `<list name>`)
```

Omit `## Stack` only when the PR is independent and based on the list-aligned release branch.

## Final output

When all possible groups are complete, show:

- Target type (list or folder), name/id, lists checked, lists skipped, and each list’s release base branch (`release_<version>`)
- Host repo for all PRs (`$ORIGIN_REPO` / `origin`)
- PRs created in merge order (each with its `--base` and URL)
- Tickets completed, skipped (including Ready tickets that are not type Build), or blocked
- Grouping parent tasks created (id/url/title) and nested subtask ids
- Verification summary
- Any ClickUp statuses or `PR` field values that could not be updated
