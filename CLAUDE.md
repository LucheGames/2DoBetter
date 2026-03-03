# 2 Do Better — Claude Instructions

## Session Start Checklist

At the start of every session, do this automatically (no need to ask):

1. **Check the server is reachable** (production runs on Ubuntu):
   ```bash
   curl -sk -o /dev/null -w "%{http_code}" https://localhost:3000/ --max-time 2
   ```
   If not `200` or `307`, the Ubuntu service may be down. SSH to Ubuntu and check:
   ```bash
   systemctl --user status 2dobetter
   systemctl --user restart 2dobetter
   ```

2. **Check the board** using the `get_board` MCP tool.
   Review what's in Dave's column and the Claude column. Note anything in-progress or blocked.

3. **Greet Dave with a 1-line board status** — e.g. "Board: 3 tasks in Dave's queue, 1 in mine (MCP server refactor, in progress)."

---

## MCP Tools (use these, not screenshots)

The `2dobetter` MCP server is registered. Use these tools for all task operations:

| Tool | What it does |
|------|-------------|
| `get_board` | Full board — all columns, lists, tasks |
| `get_column` | One column's lists + tasks (`dave` or `claude`) |
| `create_task` | Add a task to a list |
| `complete_task` | Mark a task done |
| `uncomplete_task` | Reinstate a completed task |
| `update_task` | Rename a task |
| `delete_task` | Remove a task |
| `move_task` | Move a task to a different list |
| `create_list` | Create a new list in a column |
| `delete_list` | Delete a list + its tasks |
| `search_tasks` | Find tasks by title |

---

## Column Ownership

- **Dave column** — Dave's tasks. Don't touch unless Dave asks.
- **Claude column** — Claude's workspace. Track your own in-progress work here.
  - Add a task when starting a significant piece of work
  - Complete it when done
  - Use it as a living scratchpad for what you're doing this session

---

## Project Setup

- **Server lives on:** Ubuntu box (LAN), `~/2DoBetter/` — always-on via Ethernet
- **Mac is client only** — launchd service disabled; `.app` launcher opens Ubuntu URL
- **Phone is client only** — PWA installed pointing to Ubuntu URL
- **Git repo (Mac):** `~/2DoBetter/` → remote `LucheGames/ToDoBetter`
- **DB:** `~/2DoBetter/prisma/dev.db` on Ubuntu (SQLite, gitignored — single source of truth)
- **Production service (Ubuntu):** systemd user service, HTTPS on port 3000, HTTP redirect on port 3001
  - Status: `systemctl --user status 2dobetter`
  - Restart: `systemctl --user restart 2dobetter`
  - Logs: `journalctl --user -u 2dobetter -n 100 -f`
- **TLS:** Self-signed certs in `~/2DoBetter/certs/` on Ubuntu (gitignored). Regenerate with `bash generate-certs.sh`
- **Auth:** Token-based. `AUTH_TOKEN` + `AUTH_USERNAME` in `~/2DoBetter/.env` on Ubuntu
- **MCP server:** Runs on Mac, talks to Ubuntu's API. Uses `NODE_TLS_REJECT_UNAUTHORIZED=0` for local HTTPS.
- **After code changes on Mac:**
  ```bash
  git push origin master
  # Then on Ubuntu (SSH in):
  cd ~/2DoBetter && git pull && npm install && npm run build
  systemctl --user restart 2dobetter
  ```
- **Dev server (Mac, local testing only):** `node_modules/.bin/next dev --webpack --port 3001`

## Git Rules

- `~/2DoBetter/` on Mac is the working git repo → remote `LucheGames/ToDoBetter`
- Never push without Dave's explicit permission
- Branch for features, commit straight to master for small fixes
