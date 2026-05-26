#!/usr/bin/env bash
# Build (optional) and push obsidian_ink dist artifacts to vault plugin folders on a
# USB-connected Boox / Android device via adb. Does not overwrite data.json.
#
# Usage (from obsidian_ink/):
#   npm run build:boox
#   npm run push:boox
#   npm run push:boox -- --skip-build
#
# Environment:
#   INK_BOOX_PLUGIN_DIRS — colon-separated remote plugin directories, e.g.
#     /storage/emulated/0/Documents/Testing/.obsidian/plugins/ink
#   If unset, pushes to the default vault paths used in ink-suite Boox QA.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${PLUGIN_ROOT}/dist"
PLUGIN_ID="ink"

SKIP_BUILD=false

print_usage() {
	cat <<'EOF'
Usage: bash scripts/push-plugin-to-boox.sh [--skip-build]

  --skip-build   Push existing dist/ without running npm run build

Environment:
  INK_BOOX_PLUGIN_DIRS   Colon-separated adb paths to .obsidian/plugins/ink
                         (default: Testing + Imagination and Inquiry vaults)

Requires: adb, one device in "device" state, USB debugging enabled on the tablet.
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--skip-build)
			SKIP_BUILD=true
			shift
			;;
		-h | --help)
			print_usage
			exit 0
			;;
		*)
			echo "Unknown argument: $1" >&2
			print_usage >&2
			exit 1
			;;
	esac
done

if [[ "${SKIP_BUILD}" != true ]]; then
	echo "Building obsidian_ink (production)…" >&2
	(cd "${PLUGIN_ROOT}" && npm run build)
fi

for artifact in main.js manifest.json styles.css; do
	if [[ ! -f "${DIST_DIR}/${artifact}" ]]; then
		echo "Missing ${DIST_DIR}/${artifact}. Run npm run build first." >&2
		exit 1
	fi
done

if ! command -v adb >/dev/null 2>&1; then
	echo "adb not found in PATH. Install Android platform-tools." >&2
	exit 1
fi

adb_state="$(adb get-state 2>/dev/null || true)"
if [[ "${adb_state}" != "device" ]]; then
	echo "adb: need exactly one device in 'device' state (got: '${adb_state:-none}')." >&2
	echo "Connect the Boox over USB, enable USB debugging, and run: adb devices" >&2
	exit 1
fi

device_count="$(adb devices | awk 'NR>1 && $2=="device" { c++ } END { print c+0 }')"
if [[ "${device_count}" -ne 1 ]]; then
	echo "adb: expected exactly one connected device, found ${device_count}." >&2
	adb devices >&2
	exit 1
fi

default_plugin_dirs=(
	"/storage/emulated/0/Documents/Testing/.obsidian/plugins/${PLUGIN_ID}"
	"/storage/emulated/0/Android/data/md.obsidian/files/Imagination and Inquiry/.obsidian/plugins/${PLUGIN_ID}"
)

if [[ -n "${INK_BOOX_PLUGIN_DIRS:-}" ]]; then
	IFS=':' read -r -a plugin_dirs <<<"${INK_BOOX_PLUGIN_DIRS}"
else
	plugin_dirs=("${default_plugin_dirs[@]}")
fi

if [[ ${#plugin_dirs[@]} -eq 0 ]]; then
	echo "No plugin directories configured." >&2
	exit 1
fi

echo "Pushing plugin artifacts to ${#plugin_dirs[@]} location(s)…" >&2

for remote_plugin_dir in "${plugin_dirs[@]}"; do
	if [[ -z "${remote_plugin_dir}" ]]; then
		continue
	fi
	echo "=== ${remote_plugin_dir} ===" >&2
	adb push "${DIST_DIR}/main.js" "${remote_plugin_dir}/main.js"
	adb push "${DIST_DIR}/manifest.json" "${remote_plugin_dir}/manifest.json"
	adb push "${DIST_DIR}/styles.css" "${remote_plugin_dir}/styles.css"
	adb shell "ls -la '${remote_plugin_dir}/main.js' '${remote_plugin_dir}/manifest.json' '${remote_plugin_dir}/styles.css'"
done

echo "Done. Reload Ink in Obsidian on the tablet (toggle the plugin or restart the app)." >&2
