# Documentation Standards

## Location

Store documentation in a `docs/` folder. Organise into separate pages per concept or feature — do not combine unrelated topics in one file.

**Cross-repo integrations:** Protocol and connection documentation for a companion repository lives in **one designated repo's `docs/`**. For Obsidian Ink, WebSocket protocol, stroke streaming, and drawing-area lifecycle docs live in the **eink-bridge** repo only. Do not add or maintain that cross-component documentation under this repo's `docs/`.

## Docs Are Not a Source of Truth for Code Behavior

When asked about how code works, do **not** use project documentation as a source of truth (it may be out of date).

Use:
- The code itself, when the question is about implementation/behavior
- External APIs/services the code relies on, when the question is about an integration or third-party behavior

## Choose a documentation mode

Pick the structure from the page’s job:

| If the page mainly… | Use |
|---|---|
| Explains how a system works, why a decision was made, or feature behavior | **Conceptual** |
| Walks a human through a repeatable checklist or playbook (tests, smoke, operator steps) | **Functional / playbook** |

Do not force playbook pages into conceptual sections, and do not turn conceptual pages into bare checklists.

## Conceptual documentation

For architecture, integrations, environments, provision narratives, and feature behavior.

Every conceptual page should follow this order:

1. **Conceptual understanding** — mental model before implementation details
2. **Technical details** — implementation specifics
3. **Technical Gotchas** — a dedicated section for non-obvious pitfalls

**Format:**

- Prefer Mermaid diagrams for flows and architecture over ASCII art
- Prefer bullet points over mermaid diagrams for simple steps
- Lead with context before specifics

## Functional / playbook documentation

For manual test playbooks, smoke checklists, and other strict “do this, then check that” pages.

Every playbook page should follow this order:

1. **Short intro** — one or two sentences on what the playbook is for and when to use it
2. **Setup** — prerequisites only
3. **Procedures** — discrete cases under a clear heading (e.g. `## Tests`), each as an `###` case

Within each procedure:
- Name the case clearly
- List the exact action steps
- State the verification check
