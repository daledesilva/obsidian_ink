# Remove embed

## Why it exists

When a user removes an ink embed from a note, the referenced SVG file may still exist in the vault. If that file is embedded nowhere else, the user may want to delete it to avoid orphaned files. This doc describes how the plugin offers that choice.

## Conceptual overview

The remove-embed flow scans the vault to see whether the embedded file is referenced in any other notes. If it is, the embed is removed without prompting — the file stays. If it is only in the current note, a modal asks whether to remove only the embed or also delete the file from the vault.

## Flow

```mermaid
flowchart TD
    UserClicks[User clicks Remove embed]
    UserClicks --> Scan[Scan vault for notes embedding this file]
    Scan --> Check{notes.length > 1?}
    Check -->|Yes| RemoveOnly[Remove embed only]
    Check -->|No| ShowModal[Show RemoveEmbedModal]
    ShowModal --> Choice{User choice}
    Choice -->|Remove embed| RemoveOnly
    Choice -->|Remove embed and file| RemoveAllAndDelete[Remove all embeds of file from note + vault.delete]
    RemoveOnly --> Done[Done]
    RemoveAllAndDelete --> Done
```

- **File embedded in multiple notes** — Remove embed only, no prompt. The file remains for other notes.
- **File embedded only in current note** — Modal with two options: "Remove embed" or "Remove embed and delete file".
- **"Remove embed"** — Removes this embed from the note via the CodeMirror widget (same as before). The file stays.
- **"Remove embed and delete file"** — Removes all embeds of that file from the current note (including when the same file is embedded multiple times), then deletes the file from the vault.

## Technical implementation details

| Layer | File | Responsibility |
|-------|------|---------------|
| Flow | `logic/utils/remove-embed-flow.ts` | `openRemoveEmbedFlow()` — opens modal and wires callbacks |
| Modal | `modals/remove-embed-modal/remove-embed-modal.ts` | Scans vault, shows progress, presents two buttons when file is only in current note |
| Utility | `logic/utils/convert-file-embeds.ts` | `findNotesContainingFileEmbed()`, `removeAllEmbedsOfFileFromNote()` |
| Embeds | `drawing-embed.tsx`, `writing-embed.tsx` | "Remove embed" action calls `openRemoveEmbedFlow` instead of `props.remove()` directly |

Scope: **current format only** (`formats/current/`). The v1 format keeps the original remove behaviour.

## Technical gotchas

- **Same file embedded multiple times in one note**: "Remove embed and delete file" removes all such embed lines before deleting the file, so no broken references remain.
- **sourceMdFile required**: The flow needs the markdown note containing the embed. If `sourceMdFile` is missing (edge case), the action falls back to immediate removal without the prompt.
- **Obsidian trash**: `vault.delete()` moves the file to system trash by default.
