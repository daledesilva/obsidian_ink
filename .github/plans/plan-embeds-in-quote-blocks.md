# Plan: Ink Embeds Inside Obsidian Blockquote / Quote Blocks

## Status
Planned

## Summary
When an ink embed (drawing or writing) appears inside a standard Obsidian markdown blockquote (`> ...`), it currently ignores the quote's indentation and width constraint, often overflowing the right edge of the content area. This plan covers detecting the blockquote context, applying correct indentation and a proportionally reduced default size, handling responsive behaviour, and adding e2e tests.

---

## Background & Problem Analysis

### The bleed-out cause
The embed's SCSS (in `drawing-embed.scss` and the parallel writing file) uses:
```scss
.markdown-rendered:has(.ddc_ink_drawing-embed) {
    margin: 0 calc(-1 * var(--file-margins)) !important;
}
```
This deliberately extends the embed to span the full note width (cancelling page margins). However, when the embed is nested inside a blockquote, the blockquote itself is already indented and narrower — so the same negative-margin expansion pushes the embed outside the right boundary of the note.

Similarly, the default width stored in the embed's `aspectRatio`/`width` parameters is set relative to the full page width — meaning inside a quote it is too wide.

### The Live Preview (CM6 widget) vs. Reading View (Markdown rendered) split
The embed code has two paths:
1. **Live Preview**: a CodeMirror widget rendered by `drawing-embed-extension.tsx` / `writing-embed-extension.tsx`. The widget knows the paragraph node it lives in. It can detect the `quote_quote-1` ancestor node (there is already logic walking quote siblings).
2. **Reading View**: rendered into a `.markdown-rendered` element which is a child of a `<blockquote>` DOM element.

Both paths need their own fix.

---

## Detailed Design

### 1. Detecting "inside a blockquote"

#### Live Preview widget (embed extension files)
- The CodeMirror extension already walks ancestor nodes looking for `quote_quote-1` nodes (see `drawing-embed-extension.tsx` lines ~641–665). 
- Extend that detection to count blockquote nesting depth (depth ≥ 1 = inside a quote).
- Pass an `insideBlockquote: boolean` (or `blockquoteDepth: number`) prop down to the embed React component.

#### Reading View (`.markdown-rendered`)
- Add a CSS selector that targets `.markdown-rendered` elements which have a `blockquote` ancestor:
  ```scss
  blockquote .markdown-rendered:has(.ddc_ink_drawing-embed) {
      // override the full-bleed rule
  }
  ```
  Because the negative margin rule only fires when `.markdown-rendered` has the embed class, we need to scope the override more tightly. Obsidian's Reading View renders blockquotes as `<blockquote>` elements with `.markdown-rendered` children, so the selector `blockquote :is(.markdown-rendered):has(.ddc_ink_drawing-embed)` should work.

### 2. Resetting position and indentation

#### Goal
Inside a quote, the embed should:
- **Not** use the full-bleed negative margin expansion.
- Align flush to the left edge of the quote content area (i.e. zero extra left offset).
- Have the same left border/indent visual that surrounding quote text has (this is handled automatically once we stop applying negative margins, since the blockquote's own padding/margin applies).

#### SCSS changes — `drawing-embed.scss` and writing equivalent

Add a blockquote context override rule immediately after (or wrapping) the existing rule:

```scss
// When the embed is inside a blockquote, do NOT bleed to full page width.
// Let the blockquote's natural indentation apply.
blockquote .markdown-rendered:has(.ddc_ink_drawing-embed) {
    margin: 0 !important;        // Remove the full-bleed expansion
    overflow: visible;            // Keep visible for UI elements that float outside
}
```

For the `.cm-line` quote context in Live Preview (already in `drawing-embed-extension.scss`):
- Confirm that the existing rule `padding-inline-start: 0 !important` is sufficient or needs adjustment for quote depth.

### 3. Reducing the default size inside a blockquote

The embed's rendered width is determined by the `aspectRatio` and `width` values stored in the embed anchor tag, and by the CSS that controls how the embed container is sized. The embed uses CSS to fill its container's width.

#### Approach: CSS container width
Rather than changing stored `width` parameters (which would require parsing and rewriting the embed syntax), rely on the container approach:
- Inside a blockquote, the `.markdown-rendered` element is naturally narrower (blockquote padding + border uses ~2–3em of horizontal space by default, configurable by Obsidian theme).
- Since the full-bleed expansion is removed, the embed's container is now the blockquote width — the embed will naturally fit within it.
- **No explicit `width` override should be needed** beyond removing the full-bleed rule. Verify this is true for fixed-width embeds (those with an explicit `width` attribute in the anchor tag) — those may still overflow if their stored pixel width is larger than the blockquote available width.

#### Fixed-width embeds in quotes
If an embed has an explicit `width` set that exceeds the blockquote width:
- The embed container should apply `max-width: 100%` as a rule scoped to the blockquote context:
  ```scss
  blockquote .ddc_ink_drawing-embed,
  blockquote .ddc_ink_writing-embed {
      max-width: 100%;
  }
  ```
- The embed content (tldraw canvas) must also respect this: ensure the embed React component uses `width: 100%` on the outermost container (verify current behaviour).

### 4. Responsive behaviour and alignment

#### Responsive sizing
Inside a blockquote, the panel can be resized (e.g., sidebar width changes, window resize, Obsidian's readable line width setting changes). The embed should:
- Always fill the available blockquote width (up to any stored `maxWidth`).
- Maintain its aspect ratio.
- Not overflow the quote right edge at any viewport size — rely on `max-width: 100%; box-sizing: border-box` on the embed container in the blockquote context.

#### Nested quotes (e.g. `>> ...`)
- Each additional `>` level further narrows the available width by the blockquote indentation amount.
- The same `max-width: 100%` rule cascades correctly for any depth since it's relative to the nearest `.markdown-rendered` / containing block.
- No nesting-depth-specific logic is needed beyond detecting "we are inside ≥1 blockquote level".

#### Alignment
- The embed should be left-aligned within the blockquote (the default block layout), matching the leading edge alignment of the quote's text content.
- No horizontal centering inside the blockquote (unlike some themes that center full-bleed embeds).
- The left border indicator of the blockquote (the vertical bar) should remain visible to the left of the embed — avoid any negative left margin offset inside quotes.

#### Overflow safety
- Text and UI elements (the menu bar, overflow button, resize handle) that currently float in the negative-margin space above the embed need special care inside a blockquote. They must not overflow the left edge of the blockquote's visible area. Ensure `contain: unset` is kept so they can still float out of normal flow, but test that they don't visually overlap the blockquote's left border marker.

### 5. SCSS summary of all changes

**`drawing-embed.scss`** (and parallel writing embed scss):

```scss
// === Blockquote context override ===

// Remove full-bleed expansion when inside a blockquote (Reading View)
blockquote .markdown-rendered:has(.ddc_ink_drawing-embed) {
    margin: 0 !important;
}

// Constrain fixed-width embeds to the blockquote container width
blockquote .ddc_ink_drawing-embed {
    max-width: 100%;
    box-sizing: border-box;
}
```

**`drawing-embed-extension.scss`** (Live Preview, and writing equivalent already has same structure):

```scss
// Inside a Live Preview blockquote cm-line — already handled by the existing
// padding-inline-start reset. Verify no regression and add if needed:
.cm-blockquote:has(.ddc_ink_drawing-embed) .cm-line,
.cm-line.HyperMD-quote:has(.ddc_ink_drawing-embed) {
    // Redundant guard: ensure no extra indent is added
    padding-inline-start: 0 !important;
}
```

---

## Files to Change

- `src/components/formats/current/drawing/drawing-embed/drawing-embed.scss`
- `src/components/formats/current/writing/writing-embed/writing-embed.scss` *(create or confirm it mirrors drawing-embed.scss pattern)*
- `src/components/formats/current/drawing/drawing-embed-extension/drawing-embed-extension.scss`
- `src/components/formats/current/writing/writing-embed-extension/writing-embed-extension.scss`
- Possibly `src/components/formats/current/drawing/drawing-embed/drawing-embed.tsx` and the writing equivalent if a `max-width: 100%` style must be applied inline when in blockquote context.

---

## QA Test Vault Pages

Create or update a file at `qa-test-vault/04b - Callouts and Layout Containers/In Quote Block.md`:

```markdown
# Embeds Inside Blockquote Sections

## Writing in a quote
> A quoted line before
> ![InkWriting](Ink/Writing/hello-world.svg) [Edit Writing](...)
> A quoted line after

## Drawing in a quote
> A quoted line before
> ![InkDrawing](Ink/Drawing/simple-shape.svg) [Edit Drawing](...)
> A quoted line after

## Nested quote (double indent)
>> Deeply quoted writing
>> ![InkWriting](Ink/Writing/hello-world.svg) [Edit Writing](...)

>> Deeply quoted drawing
>> ![InkDrawing](Ink/Drawing/simple-shape.svg) [Edit Drawing](...)

## Fixed-width embed in a quote (should clamp, not overflow)
> ![InkDrawing](Ink/Drawing/simple-shape.svg) [Edit Drawing](...&width=800...)

## Quote with multiple embeds
> ![InkWriting](Ink/Writing/hello-world.svg) [Edit Writing](...)
> Some interstitial text
> ![InkDrawing](Ink/Drawing/simple-shape.svg) [Edit Drawing](...)
```

---

## E2E Tests

Add `tests/e2e/embeds-in-quote-blocks.e2e.ts`:

```typescript
import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

const EMBED_SELECTOR = ".ddc_ink_embed-block, .ddc_ink_widget-root";

describe("Embeds in Blockquote Sections", function () {

    it("renders writing embed inside a blockquote", async function () {
        await obsidianPage.openFile("04b - Callouts and Layout Containers/In Quote Block.md");
        const embed = await $(EMBED_SELECTOR);
        await embed.waitForExist({ timeout: 10000 });
        await expect(embed).toExist();
    });

    it("does not overflow the right edge of the blockquote", async function () {
        await obsidianPage.openFile("04b - Callouts and Layout Containers/In Quote Block.md");
        const embed = await $(EMBED_SELECTOR);
        await embed.waitForExist({ timeout: 10000 });

        const embedRect = await browser.execute((el: Element) => {
            const r = el.getBoundingClientRect();
            return { right: r.right, width: r.width };
        }, embed);

        // Find the parent blockquote and get its right bound
        const quoteRect = await browser.execute((el: Element) => {
            const quote = el.closest('blockquote');
            if (!quote) return null;
            const r = quote.getBoundingClientRect();
            return { right: r.right, width: r.width };
        }, embed);

        if (quoteRect) {
            // Allow a small tolerance (e.g. 2px) for borders/rounding
            expect(embedRect.right).toBeLessThanOrEqual(quoteRect.right + 2);
        }
    });

    it("renders drawing embed inside a blockquote", async function () {
        await obsidianPage.openFile("04b - Callouts and Layout Containers/In Quote Block.md");
        const embeds = await $$(EMBED_SELECTOR);
        await embeds[1]?.waitForExist({ timeout: 10000 });
        expect(embeds.length).toBeGreaterThanOrEqual(2);
    });

    it("renders embeds in nested (double) blockquotes", async function () {
        await obsidianPage.openFile("04b - Callouts and Layout Containers/In Quote Block.md");
        const embeds = await $$(EMBED_SELECTOR);
        await embeds[0]?.waitForExist({ timeout: 10000 });
        // Check at least the nested embeds are present (sections 3+)
        expect(embeds.length).toBeGreaterThanOrEqual(3);
    });

    it("clamps a fixed-width embed to blockquote width", async function () {
        await obsidianPage.openFile("04b - Callouts and Layout Containers/In Quote Block.md");
        const lastEmbed = (await $$(EMBED_SELECTOR)).at(-1);
        if (!lastEmbed) return;
        await lastEmbed.waitForExist({ timeout: 10000 });

        const overflows = await browser.execute((el: Element) => {
            const parent = el.closest('blockquote') ?? el.parentElement;
            if (!parent) return false;
            const elRect = el.getBoundingClientRect();
            const parentRect = parent.getBoundingClientRect();
            return elRect.right > parentRect.right + 2;
        }, lastEmbed);

        expect(overflows).toBe(false);
    });

});
```

---

## Out of Scope / Future Work
- Changing the **stored** `width` parameter in the embed anchor when inserted inside a quotation (would require the embed-insertion command to detect cursor context). This is a potential future enhancement — for now, rely on CSS `max-width` to clamp.
- Animated resize transitions inside quotes — existing transitions may look odd when width is clamped. Can be deferred.
