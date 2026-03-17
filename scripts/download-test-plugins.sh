#!/usr/bin/env bash
# scripts/download-test-plugins.sh
# Downloads community plugins needed for e2e tests (column layouts, admonition blocks, etc.).
# Run from the obsidian_ink/ directory: bash scripts/download-test-plugins.sh
#
# Plugin folders are placed in qa-test-vault/.obsidian/plugins/ and are NOT
# committed to git (they are gitignored along with the rest of the generated
# vault). Run this script manually, or add it as a CI setup step before
# running e2e tests.

set -euo pipefail

PLUGINS_DIR="qa-test-vault/.obsidian/plugins"

download_plugin() {
  local repo="$1"
  local id="$2"
  local dest="$PLUGINS_DIR/$id"
  # Skip if already downloaded — re-run with FORCE=1 to update
  if [[ "${FORCE:-0}" != "1" ]] && [[ -f "$dest/main.js" ]]; then
    echo "Skipping $id (already present; run with FORCE=1 to re-download)"
    return
  fi
  echo "Downloading $id from $repo..."
  mkdir -p "$dest"
  curl -fsSL "https://github.com/$repo/releases/latest/download/main.js" -o "$dest/main.js"
  curl -fsSL "https://github.com/$repo/releases/latest/download/manifest.json" -o "$dest/manifest.json"
  # styles.css is optional — ignore errors if not present in the release
  curl -fsSL "https://github.com/$repo/releases/latest/download/styles.css" -o "$dest/styles.css" 2>/dev/null || true
  echo "  -> $dest"
}

# Repo slugs verified against the official Obsidian community plugins registry:
#   https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json
# Note: Modular CSS Layout (MCL) is a CSS snippet toolkit, NOT a community plugin.
# The [!multi-column] callout and #mcl/list-grid list syntax come from CSS snippets.
# To use MCL features in the QA vault, download the CSS snippet from:
#   https://github.com/efemkay/obsidian-modular-css-layout
# and place it in qa-test-vault/.obsidian/snippets/ (then enable it in appearance.json).
download_plugin "tnichols217/obsidian-columns"        "obsidian-columns"
download_plugin "ckRobinson/multi-column-markdown"    "multi-column-markdown"
download_plugin "javalent/admonitions"                "obsidian-admonition"
download_plugin "mgmeyers/obsidian-kanban"            "obsidian-kanban"
download_plugin "xhuajin/obsidian-tabs"               "tabs"
download_plugin "nothingislost/obsidian-hover-editor" "obsidian-hover-editor"
download_plugin "zsviczian/obsidian-excalidraw-plugin" "obsidian-excalidraw-plugin"

echo ""
echo "Done. Plugins downloaded to $PLUGINS_DIR"
echo "Note: Modular CSS Layout (MCL) is a CSS snippet - download separately if needed."
echo "Run 'node qa-test-vault/generate.mjs' to (re)generate vault config, then run e2e tests."
