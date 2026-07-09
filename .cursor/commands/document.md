# Document current thread feature work

Document the new or materially changed feature behavior implemented in this chat thread.

Any text after `/document` is optional context — e.g. a feature name, task ID, or a hint about which part of the thread to document.

## Scope

- Document only behavior implemented or materially changed in the current chat thread.
- Use the current conversation, uncommitted changes, commits created in this thread, tests, and implementation code as sources of truth.
- Do not document unrelated branch history, speculative future behavior, or behavior you have not verified in code.
- If the current-thread feature scope is unclear, ask a clarifying question before editing docs.

## Steps

1. Gather evidence:
   - Review the user's `/document` context and the current conversation.
   - Run `git status`, `git diff`, `git diff --staged`, and `git log -10 --oneline` to identify changes from this thread.
   - Inspect relevant implementation and tests directly before writing.

2. Choose documentation targets:
   - Prefer existing docs under `docs/` that already describe the feature or interaction.
   - Create a new focused doc page only when no existing page fits.
   - Do not combine unrelated concepts into one doc page.

3. Update docs:
   - Explain why the feature exists before implementation details.
   - Describe the user's mental model and the key flows.
   - Include technical details that future maintainers need to avoid regressions.
   - Use Mermaid diagrams for flows when they clarify the behavior.
   - Add or update a "Technical Gotchas" section for non-obvious constraints.

4. Add context comments:
   - Add brief comments for feature intent, interaction rules, lifecycle ordering, persistence contracts, constraints, edge cases, and regression-sensitive decisions.
   - Explain why functions, helpers, branches, and code snippets exist and why they are built a particular way.
   - Default to adding a short comment when future maintainers would otherwise need thread history to preserve the behavior.
   - Do not add comments that merely restate syntax or obvious assignments.

5. Verify:
   - Re-read changed docs and comments for accuracy against the implementation.
   - Do not run app install/launch steps for documentation-only changes.
   - Do not commit unless the user also invokes `/commit`.

## Output

When done, show:
- Docs created or updated
- Context comments added
- Source evidence used (commits, diffs, tests, or files)
- Any behavior intentionally not documented because it was outside the current thread
