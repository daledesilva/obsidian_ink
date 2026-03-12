# Blocked features

Features that are known to be incomplete, blocked, or non-functional. Documented so future work can pick up with context.

**See also:** [Ink embeds: contexts and limitations](ink-embeds-contexts-and-limitations.md) for the full picture of supported vs. unsupported embed contexts.

---

## Reading mode embed sizing

**Status:** Blocked (reverted)

**Why it matters:** In Obsidian’s Reading mode, ink embeds should display with the same sizing and full-bleed margins as in Live Preview. Currently they do not — the CSS and layout applied differ, so embeds look inconsistent when switching between edit and read views.

### Intended behaviour

- Embeds in Reading mode should match Live Preview: same aspect ratio, full-bleed into page margins, and consistent dimensions.
- Embeds should remain non-interactive in Reading mode (correct and expected).

### What’s missing

1. **Different rendering path:** Live Preview uses CodeMirror widgets that replace markdown with our React components. Reading mode uses Obsidian’s native MarkdownPreviewView.

2. **DOM structure:** Obsidian renders our `![InkDrawing](<path>)` and `![InkWriting](<path>)` syntax as:
   ```html
   <span alt="InkDrawing" src="Ink/Drawing/example.svg" class="internal-embed"></span>
   ```
   i.e. a `span.internal-embed`, not an `<img>` element. Our original processor targeted `img[alt="InkDrawing"]` and found nothing.

3. **Aspect ratio and margins:** The span has no intrinsic size. Our full-bleed and aspect-ratio CSS targets `.markdown-rendered:has(.ddc_ink_*)`, which only exists when our React components render. In Reading mode, those classes never appear, so our sizing rules never apply.

### Attempted fix (reverted)

A `MarkdownPostProcessor` was implemented that:
- Queried `span.internal-embed[alt="InkDrawing"]` and `span.internal-embed[alt="InkWriting"]`
- Resolved the vault path to a `TFile` and created an `<img>` via `vault.getResourcePath()`
- Parsed `aspectRatio` from the adjacent Edit link URL
- Wrapped the result in our styled container with full-bleed CSS

This was reverted because it did not work correctly in practice (reason not captured; likely display, layout, or edge-case issues).

### What’s needed to unblock

- Confirm the correct Obsidian API and DOM structure for Reading mode (including transclusion and multiple embeds).
- Verify `getFirstLinkpathDest` / `getResourcePath` resolve correctly for `context.sourcePath` in all cases.
- Validate full-bleed and aspect-ratio CSS against the Reading mode DOM (e.g. `.markdown-preview-view` vs `.markdown-rendered`).
- Add automated tests that assert embed sizing in Reading mode.
