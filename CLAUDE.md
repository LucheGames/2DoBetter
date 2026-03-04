# 2 Do Better — Claude Instructions

## Session Start Checklist

At the start of every session, do this automatically (no need to ask):

1. **Check the server is reachable** (production runs on Ubuntu, accessible via Tailscale):
   ```bash
   curl -sk -o /dev/null -w "%{http_code}" https://2dobetter.duckdns.org:3000/ --max-time 5
   ```
   If not `200`, check Tailscale is running, then SSH to Ubuntu:
   ```bash
   ssh davistator@100.105.251.44   # via Tailscale (works anywhere)
   # or: ssh davistator@192.168.10.165  # LAN only
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

- **Server lives on:** Ubuntu HP Z2 Tower, `davistator@192.168.10.165` (LAN) / `davistator@100.105.251.44` (Tailscale)
- **App URL:** `https://2dobetter.duckdns.org:3000` — works anywhere with Tailscale running
- **Mac is client only** — launchd service disabled; `.app` launcher opens `https://2dobetter.duckdns.org:3000`
- **Phone is client only** — PWA installed at `https://2dobetter.duckdns.org:3000`
- **Git repo (Mac):** `~/2DoBetter/` → remote `LucheGames/ToDoBetter`
- **DB:** `~/2DoBetter/prisma/dev.db` on Ubuntu (SQLite, gitignored — single source of truth)
- **Production service (Ubuntu):** systemd user service, HTTPS port 3000, HTTP redirect port 3001
  - Status: `systemctl --user status 2dobetter`
  - Restart: `systemctl --user restart 2dobetter`
  - Logs: `journalctl --user -u 2dobetter -n 100 -f`
- **TLS:** Let's Encrypt cert for `2dobetter.duckdns.org` in `~/2DoBetter/certs/` on Ubuntu
  - Auto-renews via acme.sh cron (DuckDNS DNS-01 challenge — no ports needed)
  - Check: `~/.acme.sh/acme.sh --list`
- **Networking:** Tailscale mesh (Ubuntu + Mac + Phone). DuckDNS `2dobetter.duckdns.org` → Tailscale IP `100.105.251.44`
  - DuckDNS refreshes every 5 min via cron
  - Ubuntu `/etc/hosts`: `127.0.0.1 2dobetter.duckdns.org` (local access without Tailscale hop)
  - Ubuntu static IP via netplan: `192.168.10.165` (router-independent)
- **Auth:** Token-based. `AUTH_TOKEN` + `AUTH_USERNAME` in `~/2DoBetter/.env` on Ubuntu (chmod 600)
- **MCP server:** Runs on Mac, talks to Ubuntu via `https://2dobetter.duckdns.org:3000`. Uses `NODE_EXTRA_CA_CERTS` for cert trust.
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
