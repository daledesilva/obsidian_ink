# Update user docs in ClickUp

Update public **User Documentation** and internal **support playbooks** in ClickUp for the product space given by the user.

Any text after `/update-user-docs` should include a ClickUp URL to the **project space**, a docs **folder**, or a **doc**. Extra words may hint which behaviour to cover.

This command writes **ClickUp only**. **Read** repo files for product truth. **Never edit** any repo file (including `docs/`, rules, commands, code). No commits. If git docs also need an update, say so and stop — that is a different request.

## Required link

If the message has **no** ClickUp URL (and no space/folder/doc ID), **stop**. Ask for a link to the product space, Internal/External Docs folder, or a doc in that space. Do not guess another product’s space.

Accept:

- Space: `https://app.clickup.com/<workspace>/v/s/<space_id>`
- Doc: `/v/dc/<document_id>` or `/docs/<document_id>` (optional `/<page_id>`)
- Folder: a folder URL, or a folder ID the user pastes

Parse IDs from the URL. Prefer IDs over names. Resolve folder/doc up to the **space** via ClickUp MCP (`clickup_get_workspace_hierarchy`, `clickup_search` with `asset_types: ["doc"]`, `clickup_list_document_pages`).

If ClickUp MCP is unavailable, stop and say so.

## Required structure

Inside that **space**, find (names may vary slightly; match case-insensitive):

| Piece | Where | Role |
|---|---|---|
| Folder **Internal Docs** | Space | Business + operator docs. Not a task folder. |
| Folder **External Docs** | Space | Public / user-visible copy. Not a task folder. |
| Doc **User Documentation** | External Docs | Written **for the user**. May be published. |
| Doc **Documentation** | Internal Docs | Map (**Documentation locations**) + **Support playbooks**. |

Also use **How we use these folders** (or equivalent) in Internal Docs if it exists — keep the split accurate, don’t turn it into user copy.

Wrong titles:

- **User Support** (or operator-voiced “help the customer” doc in External Docs) → treat as the user doc. Update pages to user voice. Ask the user to rename the **document** in ClickUp to **User Documentation** (MCP cannot rename documents).
- Playbooks living in External Docs → say so; ask to move/create them under Internal Docs. Do not leave operator playbooks in a folder the user will publish.

### If structure is missing

**Stop. Do not create yet.** List what’s missing. Ask whether to create it.

After they say yes, create with ClickUp MCP only:

1. Folders: `clickup_create_folder` in the space — **Internal Docs**, **External Docs**.
2. Docs: `clickup_create_document` (`parent.type` `"5"` = folder, `"4"` = space). **User Documentation** visibility `PUBLIC`. Internal **Documentation** `PUBLIC` (team-visible, not user-facing copy).
3. Pages: External — **Overview** plus topic pages as needed. Internal **Documentation** — **Documentation locations**, **Support playbooks**, and an **Escalation playbook template** under playbooks.

Then continue the update.

## What to write

Sources of truth for **product behaviour**: this thread, the code, and current ClickUp pages. Git `docs/` may be stale — verify in code when it matters.

Update:

1. **External Docs → User Documentation** — user-facing pages for the behaviour in scope.
2. **Internal Docs → Support playbooks** — matching operator playbooks (create a draft playbook when a new user-facing topic has no playbook yet).
3. **Documentation locations** (and the Internal Docs folder wiki, if present) only when the map is wrong.

Do not copy implementation, env vars, API paths, secrets, or prices into either ClickUp surface. Playbooks **link** git `docs/` / code; they don’t paste runbooks.

## Voice

**Rudely succinct.** Cut filler. Keep meaning. No “in one sentence”, no “expected result”, no essays.

### External — User Documentation (public)

- Second person. The reader **is** the user.
- Safe to publish. No Internal Docs links, no playbooks, no Bitwarden, no git, no ticket IDs, no “escalate”.
- Overview: short index of pages + support email if the product has one.
- One topic per page. Add a page when a new user-facing topic appears.
- Facts only: what to tap, what happens, limits (e.g. import replaces; no account).

### Internal — Support playbooks

- Operators only.
- User already followed **User Documentation**. Playbook = checks, when to file a task, repo links.
- Short recap + link to the user page. Don’t duplicate the public page.
- No secrets (name the Bitwarden item, don’t paste it). No dollar amounts.
- One playbook per symptom cluster. Use the template for new ones.

### Split

| Place | Put |
|---|---|
| External Docs | What users may see (**User Documentation**, store/press) |
| Internal Docs | Why we sell it, Play form answers, **support playbooks**, doc map |
| Git `docs/` | How it works (code-versioned) |
| Bitwarden | Secrets |

## ClickUp notes

- Prefer page update/create MCP tools. `replace` overwrites a page — don’t wipe unrelated pages.
- After creating pages, fix cross-links (user overview ↔ topics; playbook index ↔ user pages). User pages must **not** link internally.
- Don’t commit. Don’t write, stage, or delete anything in the repo.

## Output

- Space and folders used
- Structure created only after the user agreed (what was created)
- User Documentation pages created/updated
- Support playbooks created/updated
- Rename-in-UI needed (e.g. User Support → User Documentation)
- Anything still missing or skipped
