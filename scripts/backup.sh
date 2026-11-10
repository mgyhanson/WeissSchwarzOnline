#!/bin/bash
# Creates a dated zip snapshot of the project, excluding everything that is
# rebuilt or not synced (*.nosync folders, node_modules, build output).
#
# Usage: npm run backup -- <destination folder>
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: npm run backup -- <destination folder>" >&2
  exit 1
fi

dest="$1"
if [ ! -d "$dest" ]; then
  echo "Destination folder does not exist: $dest" >&2
  exit 1
fi
dest="$(cd "$dest" && pwd)"

cd "$(dirname "$0")/.."
name="$(basename "$PWD")"
out="$dest/$name-$(date +%Y%m%d-%H%M%S).zip"

cd ..
zip -r -q "$out" "$name" \
  -x "$name/node_modules" \
  -x "$name/node_modules/*" \
  -x "$name/*.nosync/*" \
  -x "$name/*/*.nosync/*" \
  -x "$name/dist/*" \
  -x "$name/coverage/*" \
  -x "*.DS_Store"

echo "Backup written to $out"
