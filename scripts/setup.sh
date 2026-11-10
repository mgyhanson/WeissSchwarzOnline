#!/bin/bash
# Installs dependencies while keeping them out of iCloud sync.
#
# iCloud Drive does not sync items whose name ends in ".nosync", so the real
# dependency folder is node_modules.nosync and node_modules is a symlink to it.
# npm replaces a node_modules symlink with a real folder on every install, so
# this script swaps the folder back before installing and re-links afterwards.
# Always install through this script (npm run setup), never plain "npm install".
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -L node_modules ]; then
  rm node_modules
fi
if [ -d node_modules.nosync ] && [ ! -e node_modules ]; then
  mv node_modules.nosync node_modules
fi

npm install --no-audit --no-fund "$@"

rm -rf node_modules.nosync
mv node_modules node_modules.nosync
ln -s node_modules.nosync node_modules

mkdir -p data.nosync
echo "Dependencies installed in node_modules.nosync (not synced by iCloud)."
