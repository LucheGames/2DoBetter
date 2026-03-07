# 2Do Better

**Self-hosted, privacy-first todo app. Multi-user. Real-time sync. No subscriptions. No tracking. Your data, your server.**

[![Buy Me a Coffee](https://img.shields.io/badge/Support-Buy%20me%20a%20coffee-yellow?logo=buy-me-a-coffee)](https://www.buymeacoffee.com/luchegames)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What is it

A minimal kanban-style todo board you run on your own machine or server. Syncs in real time across every device on your network, installs as a PWA (feels native on phone), and gives Claude Code direct programmatic access to your tasks via a built-in MCP server.

**No cloud service. No account required. No data ever leaves your server.**

### Features

- **Multi-user** — each person gets their own column; everyone sees the whole board in real time
- **Real-time sync** via Server-Sent Events — changes appear on every device within ~1 second
- **PWA** — install on iOS, Android, and desktop; works offline
- **Nested lists** — projects with sub-lists, not just flat task lists
- **Project Graveyard** — soft-delete projects; resurrect or permanently purge later
- **Drag & drop** — reorder tasks and projects within and across columns
- **Encrypted backups** — daily cron, AES-256, local or Google Drive
- **Invite-code registration** — share a time-limited code; users self-register
- **Full admin CLI** — manage users, reset passwords, export/import, all from the terminal
- **MCP server** — lets Claude Code read and write your board programmatically

### Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| Database | SQLite via Prisma 6 |
| Real-time | Server-Sent Events |
| Auth | Cookie-based token auth (`data/users.json`) |
| Server | Custom Node.js HTTPS server |
| Backup | AES-256-CBC encryption + rclone |

---

## 1. Quick Start

> **Requirements:** Node.js 20+, macOS or Linux

```bash
git clone https://github.com/LucheGames/2DoBetter.git
cd 2DoBetter
npm install
npm run setup        # interactive wizard: user, certs, backups
npm start
```

Open `https://localhost:3000`. Your browser will warn about the self-signed certificate — see [Install the CA cert](#install-the-ca-cert) below to fix this once.

The setup wizard creates everything you need:
- `data/users.json` — credentials (gitignored, chmod 600)
- `certs/` — self-signed TLS certificate + CA
- `.env.local` — local config
- `scripts/backup-db.sh` — backup script (if configured)

---

## 2. Production Server Setup & Admin

This section covers running 2Do Better as an always-on server accessible from any device.

The recommended setup: a **dedicated Linux machine** (Raspberry Pi, old PC, VPS) with Tailscale for remote access. No port forwarding. No cloud dependency.

### 2.1 Prerequisites

```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y git sqlite3
```

**Node.js 20+ via nvm (recommended — distro packages are often too old):**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 20 && nvm alias default 20
```

### 2.2 Install & First Run

```bash
git clone https://github.com/LucheGames/2DoBetter.git
cd 2DoBetter
npm install
npm run build        # compile Next.js
npm run setup        # interactive wizard — creates users, certs, backups, service
```

### 2.3 Service Management

The setup wizard installs a systemd user service automatically. To manage it manually:

```bash
npm run restart                           # restart after config changes
systemctl --user status 2dobetter         # check service state
journalctl --user -u 2dobetter -f         # live logs
```

**Auto-start on boot** (without needing to log in):
```bash
loginctl enable-linger $USER
```

### 2.4 Remote Access via Tailscale

Tailscale creates a private mesh VPN across your devices — no port forwarding, works through CGNAT.

```bash
# On the server
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4      # note this IP — clients use it to connect
```

Install Tailscale on each client (Mac, iPhone, Android) and connect. Access the app at `https://<tailscale-ip>:3000`.

**Optional — DuckDNS for a memorable hostname:**
```bash
# Register a free subdomain at duckdns.org, then update it every 5 min via cron:
*/5 * * * * curl -s "https://www.duckdns.org/update?domains=YOURNAME&token=YOURTOKEN&ip=$(tailscale ip -4)" > /dev/null
```

### 2.5 Install the CA Cert

The server uses a self-signed certificate. Install the CA cert once on each device to eliminate browser warnings permanently.

1. Visit `https://your-server:3000/ca.crt` on the client device
2. Install it:
   - **iOS:** tap the file → Settings → Profile Downloaded → Install → trust it
   - **Android:** Settings → Security → Install certificate → CA certificate
   - **macOS:** open Keychain Access → drag the file in → double-click → set to "Always Trust"
   - **Windows:** double-click the cert → Install Certificate → Local Machine → Trusted Root CAs

### 2.6 Multi-User Setup

Every user gets their own column. All columns are visible to everyone on the board.

**Add a user directly (admin only):**
```bash
npm run add-user             # prompts for username + password
```

**Invite-code self-registration:**
```bash
npm run gen-invite           # generates a 10-minute single-use code
npm run gen-invite 60        # 60-minute code

# Share the code — new user visits your URL, clicks "Create account", enters the code.
# Their column appears automatically on first login.
```

**Manage existing users:**
```bash
npm run list-users                        # all users + their column names
npm run remove-user [username]            # remove user; column renamed → "Shared"
npm run remove-user [username] delete     # remove user + delete column and all tasks
npm run reset-password [username]         # reset password without removing the user
npm run rename-user [old] [new]           # rename user and their column in one step
```

> `data/users.json` is gitignored and never committed to source control.

### 2.7 Admin CLI — Full Reference

Run `npm run admin` for a quick summary. All commands must run **on the server machine**.

**Info**

| Command | What it does |
|---------|-------------|
| `npm run status` | Service state, column names, task counts, DB size, last backup |
| `npm run list-users` | All users with admin tag and column name |
| `npm run context` | Git branch, recent commits, status, active invite codes |

**User management**

| Command | What it does |
|---------|-------------|
| `npm run setup` | Full first-run wizard |
| `npm run add-user` | Add a user interactively |
| `npm run remove-user [name]` | Remove user — column renamed to "Shared" (safe default) |
| `npm run remove-user [name] delete` | Remove user + permanently delete their column |
| `npm run reset-password [name]` | Reset password; blank input generates a random token |
| `npm run rename-user [old] [new]` | Rename user and their column atomically |
| `npm run gen-invite [minutes]` | Single-use invite code (default 10 min, expired codes auto-pruned) |

**Database**

| Command | What it does |
|---------|-------------|
| `npm run export-data [file]` | Export board to JSON (default: `2dobetter-YYYY-MM-DD.json`) |
| `npm run import-data <file>` | Import from JSON — **replaces all current data** |
| `npm run purge-completed` | Delete completed tasks — all, or older than N days |

**Service**

| Command | What it does |
|---------|-------------|
| `npm run restart` | Restart server (auto-detects launchctl / systemctl) |
| `npm run service:install` | Install auto-start launchd service (macOS) |
| `npm run service:uninstall` | Remove auto-start service (macOS) |

### 2.8 Backup & Recovery

Encrypted backups are configured during setup and run daily via cron.

**Restore from encrypted backup:**
```bash
# Decrypt
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in backup.db.enc -out restored.db \
  -pass file:~/.2dobetter_backup_key

# Replace live DB
systemctl --user stop 2dobetter
cp restored.db ~/2DoBetter/prisma/dev.db
systemctl --user start 2dobetter
```

**Portable JSON backup (easier for migrations):**
```bash
npm run export-data backup.json      # old server
npm run import-data backup.json      # new server
```

### 2.9 Deploying Updates

```bash
cd ~/2DoBetter
git pull
npm run build        # required for UI/API changes
npm run restart

# CLI-only changes (scripts/, docs) — skip the build:
git pull && npm run restart
```

---

## MCP Server (Claude Integration)

The included MCP server lets Claude Code read and update your board directly — no screenshots needed.

```bash
cd mcp && npm install && npm run build
```

Add to `~/.claude.json`:

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
