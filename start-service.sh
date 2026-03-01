#!/bin/bash
# 2 Do Better — production server startup script
# Used by launchd to auto-start on login

export PATH="/Users/macbeast/.nvm/versions/node/v20.20.0/bin:$PATH"
export NODE_ENV="production"

APP_DIR="/Users/macbeast/_Repos/github/ToDoBetter/todo-app"
cd "$APP_DIR" || exit 1

# Build and start (build uses webpack by default for next build)
npm run build 2>&1
exec npx next start --port 3000
