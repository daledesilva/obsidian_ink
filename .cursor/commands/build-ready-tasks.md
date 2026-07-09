# Build ready tasks

Implement ClickUp tickets from one list's `Build Ready` column as a sequence of focused commits and pull requests.

Any text after `/build-ready-tasks` must be a ClickUp list URL or list ID.

## Safety

- Use the ClickUp MCP server for all ClickUp reads and updates. Before the first MCP call, read the relevant tool descriptors for `clickup_get_list`, `clickup_filter_tasks`, `clickup_get_task`, and `clickup_update_task`.
- Do not use browser automation as a fallback for missing ClickUp MCP support.
- Do not start if the current git working tree has uncommitted tracked changes or unrelated untracked files. Ask the user whether to commit, stash, or remove them first.
- Never update git config, skip hooks, force push, use interactive git commands, reset, rebase, or amend unless the user explicitly asks.
- Treat this command as explicit approval to create branches, implement work, commit, push, and open PRs for the selected Build Ready tickets only.
- Stop the workflow on the first unresolved implementation, test, push, PR, or ClickUp blocker. Report the completed PRs, remaining groups, and the blocker.

## Resolve the Build Ready tickets

1. Parse the text after `/build-ready-tasks`.
   - If it is missing, ask for a ClickUp list URL or list ID and stop.
   - If it is a URL, extract the list ID when present. If the list cannot be resolved from the URL, ask for the list ID and stop.

2. Get the list with ClickUp MCP:
   - Use `clickup_get_list` with `list_id`.
   - If the input is clearly a list name rather than an ID or URL, use `clickup_get_list` with `list_name`.

3. Inspect the list's configured statuses.
   - Match the status named `Build Ready`, ignoring only case and surrounding whitespace.
   - If no matching status exists, say exactly: `There is no build ready column`
   - After saying that, do nothing else.

4. Retrieve every task in the list with the matched Build Ready status.
   - Use `clickup_filter_tasks` with `list_ids: [<list id>]`, `statuses: [<exact Build Ready status>]`, `include_closed: false`, and `subtasks: true`.
   - Paginate until all matching tasks are collected.
   - If no tasks are in Build Ready, report that and stop.

5. For each Build Ready task, fetch implementation context:
   - Use `clickup_get_task` with `include: ["dependencies", "linked_tasks", "subtasks", "description", "checklists", "custom_fields"]` and `expand_statuses: true`.
   - Record task ID, custom ID, title, URL, description summary, status, dependencies, linked tasks, subtasks, checklist size, priority, estimate if available, and available statuses.

## Build the implementation plan

Create a dependency graph using only the Build Ready tasks as in-scope implementation nodes.

- A task with no in-scope blockers is a base dependency.
- A task blocked by another Build Ready task must not be implemented before its blocker.
- If a task is blocked by a task outside the Build Ready set, report the external blocker. Do not implement that task unless the dependency is clearly informational or already complete.
- If a dependency cycle exists, report the cycle and stop.

Classify each task before grouping:

- **Base dependency:** Unlocks other Build Ready work.
- **Small related task:** Similar area, low risk, and can share a PR without making review hard.
- **Significant feature:** Large scope, multiple subsystems, many subtasks/checklist items, high estimate, risky migration, or broad user-facing behavior. Significant features get their own PR.
- **Blocked:** Has unresolved blockers outside the current Build Ready plan.

Group tasks in implementation order:

1. Put base dependencies first, provided they are not too large.
   - Group small, cohesive base dependencies into one PR when they unlock the same later work.
   - Put a large base dependency in its own PR.
2. As dependencies become unlocked, group similar small tickets together by feature area or code ownership.
3. Put each significant feature in its own PR.
4. Keep each group reviewable. If a group starts to require unrelated files, unrelated user flows, or a long test plan, split it.
5. Prefer stacked PRs when later groups depend on unmerged code from earlier groups:
   - Branch dependent groups from the prerequisite branch.
   - Open the dependent PR with the prerequisite branch as its base.
   - Report the intended merge order.

Before implementing, show a short plan with:

- The ordered PR groups
- The tickets in each group
- Which groups are stacked on earlier groups
- Any blocked or skipped tickets and why

Proceed without asking for extra confirmation unless the plan has ambiguity that could change the code architecture or release order.

## Implement each group

For each group, complete the full loop before starting the next group:

1. Prepare the branch.
   - Confirm the working tree is clean.
   - Resolve the default base branch with `gh repo view --json defaultBranchRef,nameWithOwner`.
   - For independent groups, create the branch from the default base branch.
   - For dependent groups, create the branch from the prerequisite group branch.
   - Name the branch using `git-workflow.mdc`, with the dominant prefix and a short description. Include a task ID when it helps traceability.

2. Move the group's tickets out of Build Ready.
   - Resolve an active-work status such as `In Progress` from the task's available statuses.
   - If an active-work status exists, use `clickup_update_task` to move each group task there.
   - If no active-work status exists, leave the tasks unchanged and report that status movement was skipped.

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
   - Add one `Clickup Task: <id>` line for each ticket in the group.

6. Push and open the PR.
   - Push the branch with upstream tracking if needed.
   - Create the PR with `gh pr create`.
   - Use the default base branch for independent groups.
   - Use the prerequisite group branch as the base for stacked groups.

7. Move the group's tickets to review.
   - Resolve the `Review` status from the task's available statuses.
   - If a Review status exists, use `clickup_update_task` to move each group task there after the PR exists.
   - If no Review status exists, leave the tasks unchanged and report that status movement was skipped.

8. Report progress for the group:
   - Branch
   - Commit hash
   - PR URL and base branch
   - Tickets included
   - Tests or verification run
   - ClickUp status changes

## PR body format

```markdown
## Summary

- <What changed and why>

## ClickUp

- [<task name>](<task url>) - `<task id>`

## Test plan

- [x] <verification command or manual check>

## Stack

Base: `<base branch>`
Depends on: `<prior PR URL or none>`
```

Omit `## Stack` only when the PR is independent and based on the default branch.

## Final output

When all possible groups are complete, show:

- List name and Build Ready status used
- PRs created in merge order
- Tickets completed, skipped, or blocked
- Verification summary
- Any ClickUp statuses that could not be updated
