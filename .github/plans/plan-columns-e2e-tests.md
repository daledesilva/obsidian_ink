# Plan: E2E Tests for Ink Embeds in Column Layouts

## Status
Planned

## Summary
Audit existing column test coverage, research what column approaches exist in Obsidian (native and plugin-based), set up those plugins/features properly in the e2e test environment, build a comprehensive QA vault page for columns, and write automated e2e tests for it.

---

## Research: Column Approaches in Obsidian

### Does Obsidian have native columns?
As of Obsidian 1.x (early 2026), there is **no built-in native columns layout** in Obsidian's reading or live preview. Column layouts all require either community plugins or CSS snippets.

### Community Plugins for Columns

| Plugin | Plugin ID | Syntax | Notes |
|---|---|---|---|
| **Multi-Column Markdown** | `multi-column-markdown` | Code fences: ` ```start-multi-column` / ` ```end-multi-column` | Most popular columns plugin; requires fenced code blocks |
| **Obsidian Columns** | `obsidian-columns` | Callout-based: `> [!col]` / `> [!col-md]` | Lightweight, callout-driven |
| **Modular CSS Layout (MCL)** | `modular-css-layout` (CSS snippet, also available as plugin `mcl-multi-column`) | `> [!multi-column]` with nested column callouts, or `ul` list with `#mcl/list-grid` tag | Part of a broader CSS theming toolkit; can be used as a snippet or a plugin |
| **CSS Snippets (manual)** | N/A | Any custom CSS that targets specific classes | No plugin needed; user-defined |

### Existing QA Test Vault Coverage
The vault already has three column layout pages in `04b - Callouts and Layout Containers/`:
- `In Columns - MCL List Grid.md` — tests the MCL `#mcl/list-grid` list-based approach
- `In Columns - Multi-Column Layout.md` — tests the `[!multi-column]` callout approach (MCL or Multi-Column Markdown)
- `In Columns - Obsidian Columns.md` — tests the `[!col]` / `[!col-md]` callout syntax (Obsidian Columns plugin)

However, there are **no automated e2e tests** for any of these pages.

---

## Plan

### Step 1: Investigate and Verify Column Plugin Behaviours

Before writing (or finalising) tests, manually verify:
- Which exact plugin IDs supply `[!col]` syntax (Obsidian Columns vs. MCL)
- Whether Multi-Column Markdown's code-block syntax is covered
- What DOM elements/classes the column plugins inject (needed as test selectors)

Investigate each plugin:
- **Obsidian Columns** (`obsidian-columns`): GitHub → `Aidurber/obsidian-columns`
- **Multi-Column Markdown** (`multi-column-markdown`): GitHub → `ckzm/obsidian-multi-column-markdown`
- **MCL Multi Column** / Modular CSS Layout: the community plugin ID is `modular-css-layout` (by @efemkay)

### Step 2: Set Up Plugins in the E2E Environment

**How wdio-obsidian-service loads plugins:**
The `plugins` array in `wdio:obsidianOptions` accepts local folder paths. Community plugins must be pre-installed into the vault's `.obsidian/plugins/` directory or provided as downloaded plugin folders.

**Recommended approach:** Download and commit the community plugins as files inside `qa-test-vault/.obsidian/plugins/`. This keeps the test environment self-contained and reproducible (no network at test time).

#### Folder structure to create:
```
qa-test-vault/
  .obsidian/
    plugins/
      obsidian-columns/
        main.js
        manifest.json
        styles.css       (if any)
      multi-column-markdown/
        main.js
        manifest.json
        styles.css
      modular-css-layout/
        main.js
        manifest.json
        styles.css
    community-plugins.json    ← lists enabled plugins
    app.json                  ← ensure safe-mode is off
```

#### `community-plugins.json` content:
```json
["obsidian-columns", "multi-column-markdown", "modular-css-layout"]
```

#### `app.json` snippet (ensure `"pluginEnabledStatus"` is set and `"safeMode"` is `false`):
```json
{
  "safeMode": false
}
```

**Download scripts:**
Consider adding a `scripts/download-test-plugins.sh` (or `.mjs`) script that downloads the latest release of each plugin from GitHub releases and places each into the correct folder. This script would be run manually (or in CI setup), not during the test run itself.

```bash
#!/usr/bin/env bash
# scripts/download-test-plugins.sh
# Downloads community plugins needed for e2e column tests

PLUGINS_DIR="qa-test-vault/.obsidian/plugins"

download_plugin() {
  local repo="$1"
  local id="$2"
  local dest="$PLUGINS_DIR/$id"
  mkdir -p "$dest"
  local url="https://github.com/$repo/releases/latest/download/main.js"
  curl -L "$url" -o "$dest/main.js"
  curl -L "https://github.com/$repo/releases/latest/download/manifest.json" -o "$dest/manifest.json"
  # styles.css is optional
  curl -L "https://github.com/$repo/releases/latest/download/styles.css" -o "$dest/styles.css" 2>/dev/null || true
}

download_plugin "Aidurber/obsidian-columns" "obsidian-columns"
download_plugin "ckzm/obsidian-multi-column-markdown" "multi-column-markdown"
download_plugin "efemkay/obsidian-modular-css-layout" "modular-css-layout"
```

Add an npm script in `package.json`:
```json
"download-test-plugins": "bash scripts/download-test-plugins.sh"
```

> **Note on CI:** Add `qa-test-vault/.obsidian/plugins/` to `.gitignore` (or don't commit the compiled JS) and run `npm run download-test-plugins` in the CI workflow before running e2e tests. Alternatively, commit the plugin files directly if their licenses permit, which avoids the network dependency.

### Step 3: Update/Expand the QA Vault Columns Pages

Expand or create a single comprehensive page:  
**`qa-test-vault/04b - Callouts and Layout Containers/In Columns - All Methods.md`**

This page should:
- Have clear H2 headings for each column method (for human readability during manual QA)
- Include both writing and drawing embeds in each column type
- Note which plugin is required in a comment or italics below each heading

```markdown
# Embeds in Column Layouts

---

## Multi-Column Markdown (code fence syntax)
*Requires: Multi-Column Markdown plugin*

` ``` start-multi-column
ID: ink-test-1
number of columns: 2
` ```

**Left column**
![InkWriting](Ink/Writing/hello-world.svg) [Edit Writing](...)

` ``` column-break
` ```

**Right column**
![InkDrawing](Ink/Drawing/simple-shape.svg) [Edit Drawing](...)

` ``` end-multi-column

---

## Obsidian Columns plugin ([!col] callout)
*Requires: Obsidian Columns plugin*

> [!col]
>> **Left**
>> ![InkWriting](Ink/Writing/hello-world.svg) [Edit Writing](...)
>
>> [!col-md]
>> **Right**
>> ![InkDrawing](Ink/Drawing/simple-shape.svg) [Edit Drawing](...)

---

## MCL Multi Column ([!multi-column] callout)
*Requires: Modular CSS Layout plugin or MCL CSS snippet*

> [!multi-column]
>
>> [!col-md|30]
>> **Left 30%**
>> ![InkWriting](Ink/Writing/hello-world.svg) [Edit Writing](...)
>
>> [!col-md|70]
>> **Right 70%**
>> ![InkDrawing](Ink/Drawing/simple-shape.svg) [Edit Drawing](...)

---

## MCL List Grid (hashtag syntax)
*Requires: Modular CSS Layout plugin or MCL CSS snippet*

- #mcl/list-grid
-   ![InkWriting](Ink/Writing/hello-world.svg) [Edit Writing](...)
-   ![InkDrawing](Ink/Drawing/simple-shape.svg) [Edit Drawing](...)

---

## Three-Column Layout (Multi-Column Markdown)
*Requires: Multi-Column Markdown plugin*

` ``` start-multi-column
ID: ink-test-3col
number of columns: 3
` ```

**Column A**
![InkWriting](Ink/Writing/hello-world.svg) [Edit Writing](...)

` ``` column-break
` ```

**Column B**
![InkDrawing](Ink/Drawing/simple-shape.svg) [Edit Drawing](...)

` ``` column-break
` ```

**Column C**
![InkWriting](Ink/Writing/hello-world.svg) [Edit Writing](...)

` ``` end-multi-column
```

> **Note on the existing separate pages:** The existing files `In Columns - MCL List Grid.md`, `In Columns - Multi-Column Layout.md`, and `In Columns - Obsidian Columns.md` can be kept for manual human inspection but the e2e tests should target this unified page. Alternatively, retain the separate files and test each one individually (see Step 4 option B).

### Step 4: Write E2E Tests

Create `tests/e2e/embeds-in-columns.e2e.ts`.

#### Design decisions
- **Option A (unified page):** Test each column method from the single `In Columns - All Methods.md` page. Simpler but dependent on all plugins loading.
- **Option B (separate files, one per plugin):** Open each of the three existing pages separately. More isolated, easier to debug which plugin is broken.

**Recommended: Option B** — keep separate files for isolation, but add the comprehensive `All Methods` page for human QA.

#### Selectors to determine
The embed selector used across the e2e suite:
```ts
const EMBED_SELECTOR = ".ddc_ink_embed-block, .ddc_ink_widget-root";
```

Column container selectors (to verify the plugin is rendering columns):
- Multi-Column Markdown: `.multi-column-container`, `.columnParent`
- Obsidian Columns: `.obsidian-columns`, `.callout[data-callout="col"]`
- MCL Multi Column: `.callout[data-callout="multi-column"]`

> **Important:** Confirm these selectors by inspecting the DOM in a running test vault before finalising the tests. The selectors above are best guesses based on typical plugin output and may need adjustment.

#### Test file outline

```typescript
import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

const EMBED_SELECTOR = ".ddc_ink_embed-block, .ddc_ink_widget-root";

describe("Embeds in Column Layouts", function () {

    // ─── Obsidian Columns plugin ─────────────────────────────────────────────

    describe("Obsidian Columns plugin ([!col] callout)", function () {
        it("renders writing and drawing embeds inside [!col] columns", async function () {
            await obsidianPage.openFile(
                "04b - Callouts and Layout Containers/In Columns - Obsidian Columns.md"
            );
            const embeds = await $$(EMBED_SELECTOR);
            await embeds[0]?.waitForExist({ timeout: 10000 });
            expect(embeds.length).toBeGreaterThanOrEqual(2);
        });

        it("each embed fits within its column and does not overflow", async function () {
            await obsidianPage.openFile(
                "04b - Callouts and Layout Containers/In Columns - Obsidian Columns.md"
            );
            const embeds = await $$(EMBED_SELECTOR);
            for (const embed of embeds) {
                await embed.waitForExist({ timeout: 10000 });
                const overflow = await browser.execute((el: Element) => {
                    const parent = el.closest('.callout') ?? el.parentElement;
                    if (!parent) return false;
                    const eRect = el.getBoundingClientRect();
                    const pRect = parent.getBoundingClientRect();
                    return eRect.right > pRect.right + 2;
                }, embed);
                expect(overflow).toBe(false);
            }
        });
    });

    // ─── Multi-Column Markdown ───────────────────────────────────────────────

    describe("Multi-Column Markdown plugin (code fence)", function () {
        it("renders writing and drawing embeds inside multi-column-markdown columns", async function () {
            await obsidianPage.openFile(
                "04b - Callouts and Layout Containers/In Columns - Multi-Column Layout.md"
            );
            const embeds = await $$(EMBED_SELECTOR);
            await embeds[0]?.waitForExist({ timeout: 10000 });
            expect(embeds.length).toBeGreaterThanOrEqual(2);
        });

        it("each embed fits within its column and does not overflow", async function () {
            await obsidianPage.openFile(
                "04b - Callouts and Layout Containers/In Columns - Multi-Column Layout.md"
            );
            const embeds = await $$(EMBED_SELECTOR);
            for (const embed of embeds) {
                await embed.waitForExist({ timeout: 10000 });
                const overflow = await browser.execute((el: Element) => {
                    // Multi-Column Markdown wraps columns in a div with class like 'columnParent'
                    const parent = el.closest('[class*="column"]') ?? el.parentElement;
                    if (!parent) return false;
                    const eRect = el.getBoundingClientRect();
                    const pRect = parent.getBoundingClientRect();
                    return eRect.right > pRect.right + 2;
                }, embed);
                expect(overflow).toBe(false);
            }
        });
    });

    // ─── MCL Multi Column ────────────────────────────────────────────────────

    describe("MCL Multi Column ([!multi-column] and list-grid)", function () {
        it("renders embeds inside [!multi-column] callout columns", async function () {
            await obsidianPage.openFile(
                "04b - Callouts and Layout Containers/In Columns - MCL List Grid.md"
            );
            const embeds = await $$(EMBED_SELECTOR);
            await embeds[0]?.waitForExist({ timeout: 10000 });
            expect(embeds.length).toBeGreaterThanOrEqual(2);
        });

        it("each embed fits within its list-grid cell and does not overflow", async function () {
            await obsidianPage.openFile(
                "04b - Callouts and Layout Containers/In Columns - MCL List Grid.md"
            );
            const embeds = await $$(EMBED_SELECTOR);
            for (const embed of embeds) {
                await embed.waitForExist({ timeout: 10000 });
                const overflow = await browser.execute((el: Element) => {
                    const parent = el.closest('li') ?? el.parentElement;
                    if (!parent) return false;
                    const eRect = el.getBoundingClientRect();
                    const pRect = parent.getBoundingClientRect();
                    return eRect.right > pRect.right + 2;
                }, embed);
                expect(overflow).toBe(false);
            }
        });
    });

    // ─── All Methods (Comprehensive) ─────────────────────────────────────────

    describe("All column methods — comprehensive page", function () {
        it("renders at least one embed per column method section", async function () {
            await obsidianPage.openFile(
                "04b - Callouts and Layout Containers/In Columns - All Methods.md"
            );
            const embeds = await $$(EMBED_SELECTOR);
            await embeds[0]?.waitForExist({ timeout: 15000 });
            // The page has writing + drawing in 4 sections × 2 embeds each = 8+ embeds
            expect(embeds.length).toBeGreaterThanOrEqual(6);
        });
    });

});
```

---

## Files to Create / Modify

### New files
- `scripts/download-test-plugins.sh` — downloads community plugin releases into vault
- `qa-test-vault/.obsidian/community-plugins.json` — enables the three plugins
- `qa-test-vault/.obsidian/app.json` — disables safe mode
- `qa-test-vault/.obsidian/plugins/obsidian-columns/` — downloaded plugin files
- `qa-test-vault/.obsidian/plugins/multi-column-markdown/` — downloaded plugin files
- `qa-test-vault/.obsidian/plugins/modular-css-layout/` — downloaded plugin files
- `qa-test-vault/04b - Callouts and Layout Containers/In Columns - All Methods.md` — comprehensive QA page
- `tests/e2e/embeds-in-columns.e2e.ts` — e2e tests

### Possibly modified
- `package.json` — add `"download-test-plugins"` npm script
- `.gitignore` — decide whether to ignore compiled plugin JS or commit it

---

## Notes & Open Questions

1. **Plugin DOM selectors** — The overflow-containment tests above use guessed selectors. These must be verified by running the vault with plugins enabled and inspecting the DOM in DevTools. Adjust selectors before finalising tests.

2. **Plugin GitHub repo names** — Verify exact repo slugs for download script:
   - `Aidurber/obsidian-columns` (or search community plugin registry for `obsidian-columns`)
   - `ckzm/obsidian-multi-column-markdown` (verify on GitHub)
   - `efemkay/obsidian-modular-css-layout` (verify on GitHub)

3. **MCL as CSS snippet vs. plugin** — MCL is primarily a CSS snippet toolkit, but the community plugin `mcl-multi-column` (if it exists as a standalone plugin) may differ from the CSS snippet approach. Clarify whether the existing `In Columns - MCL List Grid.md` requires the MCL plugin or a CSS snippet to render correctly. If it's a CSS snippet, the snippet must be placed in `qa-test-vault/.obsidian/snippets/` and enabled in `appearance.json`.

4. **Safe mode** — The `qa-test-vault/.obsidian/app.json` must set `"safeMode": false` or community plugins won't load. Confirm this is done.

5. **`wdio.conf.mts` update** — No change needed to `wdio.conf.mts` since only the `./dist` (the ink plugin) is listed in `plugins`. Community plugins loaded from the vault's `.obsidian/plugins/` directory are picked up automatically by Obsidian when safe mode is disabled.

6. **CI pipeline** — Add a step before `npx wdio run ./wdio.conf.mts` that runs `npm run download-test-plugins` to ensure plugin files are present. If plugin files are committed to the repo, this step is unnecessary.
