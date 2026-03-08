# 2Do Better

**A shared 2Do board for humans and AI agents. Self-hosted, real-time, no subscriptions.**

[![Buy Me a Coffee](https://img.shields.io/badge/Support-Buy%20me%20a%20coffee-yellow?logo=buy-me-a-coffee)](https://www.buymeacoffee.com/luchegames)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What is it

2Do Better is a **multi-user, multi-agent** task board you run on your own machine. Every person gets a column. Claude Code gets one too — and can read and update the board directly via a built-in MCP server. All columns are shared and sync in real time across every device on your network.

No cloud account. No tracking. Your data stays on your machine.

**The workflow:** you and your AI pair each manage your own 2Do column, share context, and track what's in flight — together.

---

## Quick Start

> **Requires:** Node.js 20+, macOS or Linux

```bash
git clone https://github.com/LucheGames/2DoBetter.git
cd 2DoBetter
npm install
npm run setup        # creates your user, certs, and first-run config
npm start
```

Open `https://localhost:3000`. Accept the browser cert warning for now (see [Install the CA cert](#install-the-ca-cert) to fix permanently).

The setup wizard creates:
- `data/users.json` — your credentials (gitignored)
- `certs/` — self-signed TLS cert + CA
- `.env.local` — local config

---

## Connect Your Phone (LAN)

After `npm run setup`, the installer prints your local IP and a URL. On your phone:

1. Visit `http://your-local-ip:3001/ca.crt` and install the certificate
   - **iOS:** tap file → Settings → Profile Downloaded → Install → then Settings → General → About → Certificate Trust Settings → enable it
   - **Android:** Settings → Security → Install certificates → CA certificate
2. Open `https://your-local-ip:3000` in your phone's browser
3. Tap **Share → Add to Home Screen** to install as a PWA

---

## Features

- **Multi-user** — each person gets a column; everyone sees the full board
- **AI agent column** — Claude Code can read and write your board via MCP
- **Real-time sync** via SSE — changes appear on every device in ~1 second
- **PWA** — install on iOS, Android, and desktop; works offline
- **Nested lists** — projects with sub-lists, not flat task dumps
- **Project Graveyard** — soft-delete projects; restore or purge later
- **Drag & drop** — reorder tasks and projects within and between columns
- **Invite-code registration** — share a time-limited link; teammates self-register
- **Full admin CLI** — manage users, reset passwords, export/import, all from terminal
- **Encrypted backups** — daily cron, AES-256, local or Google Drive

---

## Optional: Run as a Background Service

By default, `npm start` runs in your terminal. To have 2Do Better start automatically on login:

**macOS:**
```bash
npm run service:install    # installs a launchd agent
```
The installer also creates a `2DoBetter.app` in `/Applications` — double-click it to open the board.

**Linux (systemd):**
```bash
# The setup wizard handles this automatically.
# To manage manually:
systemctl --user status 2dobetter
systemctl --user restart 2dobetter
journalctl --user -u 2dobetter -f    # live logs

# Auto-start at boot (no login needed):
loginctl enable-linger $USER
```

---

## Optional: Access from Anywhere (Tailscale + DuckDNS)

By default, 2Do Better is accessible on your local network only. If you want to access it from outside your home network (e.g. on mobile data), Tailscale is the simplest option — no port forwarding, works through CGNAT.

**1. Install Tailscale on your server and all client devices:**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4    # note this IP — clients connect to it
```

Access the app at `https://<tailscale-ip>:3000`.

**2. Optional — DuckDNS for a memorable hostname:**

Register a free subdomain at [duckdns.org](https://duckdns.org), then keep it updated:
```bash
# Add to crontab (crontab -e):
*/5 * * * * curl -s "https://www.duckdns.org/update?domains=YOURNAME&token=YOURTOKEN&ip=$(tailscale ip -4)" > /dev/null
```

---

## Multi-User Setup

Every user gets their own column. All columns are visible to everyone.

**Add a user directly:**
```bash
npm run add-user             # prompts for username + password
```

**Invite someone to self-register:**
```bash
npm run gen-invite           # 10-minute single-use code
npm run gen-invite 60        # 60-minute code
# Share the code — they visit your URL, click "Create account", enter the code.
```

**Manage users:**
```bash
npm run list-users
npm run remove-user [name]              # column renamed → "Shared"
npm run remove-user [name] delete       # remove user + delete all their tasks
npm run reset-password [name]
npm run rename-user [old] [new]
```

> `data/users.json` is gitignored and never committed.

---

## Claude Code / MCP Integration

The included MCP server gives Claude Code direct read/write access to your board — no screenshots, no copy-pasting.

**Build the MCP server:**
```bash
cd mcp && npm install && npm run build
```

**Add to `~/.claude.json`:**
```json
{
  "mcpServers": {
    "2dobetter": {
      "command": "node",
      "args": ["/path/to/2DoBetter/mcp/dist/server.js"],
      "env": {
        "API_BASE_URL": "https://your-server:3000",
        "AUTH_TOKEN": "your-token",
        "AUTH_USER": "your-username"
      }
    }
  }
}
```

**Available tools:** `get_board`, `get_column`, `create_task`, `complete_task`, `uncomplete_task`, `update_task`, `delete_task`, `move_task`, `create_list`, `delete_list`, `search_tasks`

Once connected, Claude can check your 2Dos at the start of every session, mark things done as it works, and keep its own column updated — turning it into a genuine collaborator rather than a tool you direct.

---

## Admin CLI Reference

Run `npm run admin` for a quick summary. All commands run on the server machine.

**Info**

| Command | What it does |
|---------|-------------|
| `npm run status` | Service state, users, task counts, DB size, last backup |
| `npm run list-users` | All users with admin tag and column name |
| `npm run context` | Git branch, recent commits, server health, active invite codes |

**User management**

| Command | What it does |
|---------|-------------|
| `npm run setup` | Full first-run wizard |
| `npm run add-user` | Add a user interactively |
| `npm run remove-user [name]` | Remove user — column renamed to "Shared" |
| `npm run remove-user [name] delete` | Remove user + delete column and all tasks |
| `npm run reset-password [name]` | Reset password; blank input generates a random token |
| `npm run rename-user [old] [new]` | Rename user and their column atomically |
| `npm run gen-invite [minutes]` | Single-use invite code (default 10 min) |

**Database**

| Command | What it does |
|---------|-------------|
| `npm run export-data [file]` | Export board to JSON |
| `npm run import-data <file>` | Import from JSON — **replaces all current data** |
| `npm run purge-completed` | Delete completed tasks — all, or older than N days |

**Service**

| Command | What it does |
|---------|-------------|
| `npm run restart` | Restart server (auto-detects launchctl / systemctl) |
| `npm run service:install` | Install auto-start service (macOS) |
| `npm run service:uninstall` | Remove auto-start service (macOS) |

---

## Backup & Recovery

Encrypted backups are configured during setup and run daily via cron.

**Restore from encrypted backup:**
```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in backup.db.enc -out restored.db \
  -pass file:~/.2dobetter_backup_key

systemctl --user stop 2dobetter
cp restored.db ~/2DoBetter/prisma/dev.db
systemctl --user start 2dobetter
```

**Portable JSON backup (easier for migrations):**
```bash
npm run export-data backup.json    # old server
npm run import-data backup.json    # new server
```

---

## Deploying Updates

```bash
git pull
npm run build        # required for UI/API changes
npm run restart

# CLI-only changes (scripts/, docs) — skip the build:
git pull && npm run restart
```

---

## Roadmap

- [x] First-run setup wizard
- [x] Multi-user with shared board visibility
- [x] Invite-code self-registration
- [x] JSON export / import
- [x] Full admin CLI
- [x] MCP server for Claude Code
- [x] Collapsible teammate columns
- [ ] App Store listing via PWABuilder

---

## Support

2Do Better is free and open source. If it saves you time:

[![Buy Me a Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/luchegames)

## License

MIT — use it, fork it, ship it.
