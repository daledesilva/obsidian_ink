#!/bin/bash
#
# Publish an internal-test GitHub release (CI-built plugin zip + assets).
#
# HOW IT WORKS
# ------------
# 1. This script does NOT run `npm run build` locally.
# 2. It deletes and recreates the git tag `internal-test` on your current HEAD commit,
#    then pushes that tag to origin.
# 3. GitHub Actions (`.github/workflows/publish-internal-release.yml`) runs on the tag
#    push, checks out THAT COMMIT on ubuntu-latest, runs `npm install` + `npm run build`,
#    and uploads dist/ as the internal-test release assets. Does not start the Test
#    workflow (unit/e2e stay local or Actions → Test, manual-only).
#
# WHAT GETS BUILT
# ---------------
# - Only committed files at the tagged commit — NOT uncommitted working-tree changes.
# - NOT your local `dist/` folder.
# - The branch name does not matter; the tag points at whatever commit HEAD was on when
#   you ran this script. Push your branch to origin before tagging if CI must see new commits.
#
# DEBUGGING ON IPAD / DEVICE
# --------------------------
# Internal release is the wrong loop for rapid Cursor Debug iteration unless you commit
# and push first, wait for CI, then reinstall from GitHub.
#
# For active debugging, prefer ONE of:
#   A) `npm run build` locally, then copy `dist/main.js`, `dist/styles.css`, and
#      `dist/manifest-beta.json` (as `manifest.json`) into the device vault plugin folder.
#   B) Commit + push your debug instrumentation, run this script, wait for CI, reinstall.
#
# See obsidian_ink/docs/debugging-on-ipad.md and obsidian_ink/docs/development.md.

# Remove any existing local tags not on the remote
git fetch --prune origin "+refs/tags/*:refs/tags/*"

# Delete local tag if it exists
git tag -d internal-test

# Delete remote tag if it exists
git push origin --delete internal-test

# Create new tag on current HEAD
git tag internal-test

# Push the new tag (CI builds the commit the tag points to)
git push origin --tags
