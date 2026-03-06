#!/bin/bash
# 2Do Better — production build script
# Automatically finds Node.js v20+ via nvm or PATH.
# Run with: bash scripts/build.sh  OR  npm run build
set -euo pipefail

# ── Find Node.js v20+ ────────────────────────────────────────────────────────
NODE_BIN=""
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  source "$HOME/.nvm/nvm.sh" --no-use 2>/dev/null || true
  NODE_BIN=$(nvm which 20 2>/dev/null || nvm which default 2>/dev/null || true)
fi
NODE_BIN="${NODE_BIN:-$(command -v node 2>/dev/null || true)}"

if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found. Install nvm (https://github.com/nvm-sh/nvm) or add node to PATH." >&2
  exit 1
fi

# Version check — require v18+
NODE_MAJOR=$("$NODE_BIN" -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "ERROR: Node.js v18+ required (found $("$NODE_BIN" --version)). Run: nvm install 20" >&2
  exit 1
fi

echo "▸ Using Node $("$NODE_BIN" --version) at $NODE_BIN"

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

export PATH="$(dirname "$NODE_BIN"):$PATH"

echo "▸ Running prisma generate..."
"$NODE_BIN" node_modules/.bin/prisma generate

echo "▸ Running next build..."
"$NODE_BIN" node_modules/.bin/next build
