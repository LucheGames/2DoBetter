#!/bin/bash
# 2 Do Better — production server startup script
# Managed by launchd — do not run manually (use npm run service:*)

export PATH="/Users/macbeast/.nvm/versions/node/v20.20.0/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export NODE_ENV="production"

APP_DIR="$HOME/2DoBetter"
cd "$APP_DIR" || exit 1

# Start the custom HTTPS/HTTP server (build is done during install, not on every boot)
exec node server.js
