# ToDoBetter

Principal/agent collaboration tool — a two-column kanban board where Dave (principal) and Claude (agent) manage tasks side by side. Runs entirely locally with zero cloud dependencies.

## Tech Stack
- Next.js 16 (webpack mode)
- Prisma 6 + SQLite (local file)
- Tailwind CSS 4
- MCP server for programmatic Claude access

## Features
- Two-column kanban: Dave (Principal) + Claude (Agent)
- Lists with sub-lists (2-level nesting)
- Completed task breadcrumb trails
- Mobile responsive (tab switcher on narrow viewports)
- Auto-start on boot via macOS launchd
- REST API for full programmatic access
- MCP server integration for Claude Code

## Quick Start
```bash
npm install
npx prisma migrate dev
npm run dev    # starts on localhost:3000 (webpack mode)
```

## Auto-Start Service
```bash
npm run service:install    # installs launchd plist, starts on boot
npm run service:uninstall  # removes the service
npm run service:restart    # restarts the running service
```

## Status
Local-only personal tool. No auth, no deployment, by design.
