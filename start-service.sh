#!/bin/bash
# 2Do Better — production server startup script
# Managed by launchd (macOS) or systemd (Linux) — do not run manually.

export NODE_ENV="production"

# ── Locate Node.js dynamically ───────────────────────────────────────────────
# Try nvm first (works if nvm is installed for this user), then fall back to PATH.
NODE_BIN=""
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  source "$HOME/.nvm/nvm.sh" --no-use 2>/dev/null || true
  NODE_BIN=$(nvm which default 2>/dev/null || true)
fi
# Fall back to whatever `node` is on PATH (system Node, snap, etc.)
NODE_BIN="${NODE_BIN:-$(command -v node 2>/dev/null)}"

if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found. Install nvm or ensure node is on PATH." >&2
  exit 1
fi

export PATH="$(dirname "$NODE_BIN"):/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

APP_DIR="$HOME/2DoBetter"
cd "$APP_DIR" || exit 1

# Start the custom HTTPS/HTTP server (build is done during install, not on every boot)
exec "$NODE_BIN" server.js
