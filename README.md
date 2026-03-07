# 2Do Better

**Self-hosted, privacy-first todo app. Multi-user. Real-time sync. No subscriptions. No tracking. Your data, your server.**

[![Buy Me a Coffee](https://img.shields.io/badge/Support-Buy%20me%20a%20coffee-yellow?logo=buy-me-a-coffee)](https://www.buymeacoffee.com/luchegames)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What it is

2Do Better is a minimal kanban-style todo board you run on your own machine or server. It syncs in real time across every device on your network — desktop, phone, tablet — and installs as a PWA so it feels native everywhere.

There is no cloud service. No account required. No data ever leaves your server.

## Philosophy

Most todo apps ask you to trust a company with your tasks forever — and charge you monthly for the privilege. 2Do Better flips that:

- **You own the data.** SQLite on your server. Back it up anywhere you like.
- **No lock-in.** Export to JSON any time. One file, one database.
- **No noise.** No AI suggestions, no integrations marketplace, no upsell banners. Just lists and tasks.
- **Offline-capable.** PWA service worker keeps the app usable when the server is temporarily unreachable.
- **Privacy by default.** No telemetry, no analytics, no third-party requests (except the optional Buy Me a Coffee link).

## Use cases

- Personal productivity for people who want control over their data
- Small teams and code shops on a Tailscale mesh — each person gets their own column, everyone sees the full board
- A companion board for AI agent workflows — the built-in MCP server lets Claude read and update tasks directly
- Anyone tired of paying per month for a list app

## Features

- **Multi-user** — each team member gets their own column; everyone sees the whole board in real time
- **Real-time sync** across all clients via Server-Sent Events — changes appear instantly on every device
- **PWA** — installable on iOS, Android, and desktop; usable offline
- **Nested lists** — projects with sub-lists, not just flat task lists
- **Encrypted backups** — daily cron job, AES-256 encrypted, uploads to Google Drive or local storage
- **MCP server** — lets Claude Code read and write your board programmatically
- **Tailscale-ready** — access securely from anywhere without opening firewall ports
- **Invite-code registration** — share a time-limited code; new users self-register without admin involvement
- **Full admin CLI** — manage users, reset passwords, export/import data, all from the terminal

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| Database | SQLite via Prisma 6 |
| Real-time | Server-Sent Events |
| Auth | Cookie-based token auth (users stored in `data/users.json`) |
| Server | Custom Node.js HTTPS server |
| Backup | rclone + AES-256-CBC encryption |

---

## Quick start (local / development)

> **Requirements:** Node.js 20+, macOS or Linux

```bash
git clone https://github.com/LucheGames/2DoBetter.git
cd 2DoBetter
npm install
npm run setup        # interactive first-run wizard
npm start
```

The setup wizard guides you through:
1. Setting your username and access passphrase
2. Choosing a backup destination (local / Google Drive / skip)
3. Enabling backup encryption (recommended)

Open the URL shown in your terminal (default `https://localhost:3000`).

> **Self-signed TLS:** Your browser will warn you on first visit. Install the CA cert once (`ca.crt` is served at `https://your-server:3000/ca.crt`) and the warning disappears permanently.

---

## Production server setup

The recommended setup is a always-on Linux machine (a Raspberry Pi, old PC, or VPS all work fine) running as a systemd user service.

### 1. Install prerequisites

```bash
# Ubuntu / Debian
sudo apt update
sudo apt install -y git nodejs npm sqlite3

# Verify Node version (needs 20+)
node --version   # if < 20, use nvm (see below)
```

**Using nvm (recommended):**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20
```

### 2. Clone and set up the app

```bash
git clone https://github.com/LucheGames/2DoBetter.git
cd 2DoBetter
npm install
npm run build        # compiles the Next.js app
npm run setup        # interactive wizard: users, certs, backups
```

The wizard creates:
- `data/users.json` — user credentials (gitignored, chmod 600)
- `.env.local` — local config (port, cert paths, etc.)
- `certs/` — self-signed TLS certificate
- `scripts/backup-db.sh` — backup script (if you configured backups)

### 3. Install as a systemd user service (auto-start)

```bash
# The setup wizard installs the service automatically, but you can also run:
npm run service:install

# Verify it's running
systemctl --user status 2dobetter

# View live logs
journalctl --user -u 2dobetter -f
```

The service auto-starts on login (enable lingering so it starts on boot even without login):
```bash
loginctl enable-linger $USER
```

### 4. Access from other devices

**Same network:** Use the server's local IP, e.g. `https://192.168.1.100:3000`

**Anywhere via Tailscale (recommended):**
```bash
# Install Tailscale on the server
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Then access from any Tailscale device at:
# https://<tailscale-ip>:3000
```

**Optional — DuckDNS for a memorable hostname:**
```bash
# Add to crontab: update DuckDNS every 5 minutes
*/5 * * * * curl -s "https://www.duckdns.org/update?domains=yourname&token=yourtoken&ip=$(tailscale ip -4)" > /dev/null
```

### 5. Install the CA cert on clients

To avoid browser warnings on every device:

1. Visit `https://your-server:3000/ca.crt` on each client device
2. Install the downloaded certificate as a trusted CA

On iOS: tap the file → Settings → Profile Downloaded → Install
On Android: Settings → Security → Install certificate → CA certificate
On Mac: open Keychain Access → drag the file in → set to "Always Trust"

---

## Multi-user setup

Every user gets their own column on the shared board. All columns are visible to everyone.

**Add users interactively:**
```bash
npm run add-user             # prompts for username + password
```

**Invite-code self-registration** (users create their own account):
```bash
# On the server — generate a time-limited code (default: 10 minutes)
npm run gen-invite
npm run gen-invite 60        # 60-minute code

# Share the code with the new user.
# They visit your server URL, click "Create account", and enter the code.
# Their column is created automatically on first login.
```

**Manage users:**
```bash
npm run list-users                        # list all users with their column names
npm run remove-user [username]            # remove user, rename column → "Shared"
npm run remove-user [username] delete     # remove user + delete column and all tasks
npm run reset-password [username]         # reset a user's password without removing them
npm run rename-user [old] [new]           # rename a user and their column
```

> `data/users.json` stores all credentials. It is gitignored and never committed.

---

## Admin CLI — full reference

Run `npm run admin` for a summary. All commands must be run on the machine where the app is installed.

### Info

| Command | What it does |
|---------|-------------|
| `npm run status` | Service state, users, column names, task counts, DB size, last backup |
| `npm run list-users` | All users with admin tag and their column name |
| `npm run context` | Full session dump: git branch, last commits, status, active invites |

### User management

| Command | What it does |
|---------|-------------|
| `npm run setup` | Full first-run wizard |
| `npm run add-user` | Add a user interactively (username + password) |
| `npm run remove-user [name]` | Remove user — column renamed to "Shared" (safe default) |
| `npm run remove-user [name] delete` | Remove user + permanently delete their column and all tasks |
| `npm run reset-password [name]` | Reset a user's password; blank input generates a random token |
| `npm run rename-user [old] [new]` | Rename a user and automatically rename their column to match |
| `npm run gen-invite [minutes]` | Generate a single-use invite code (default 10 min). Expired codes are auto-pruned. |

### Database

| Command | What it does |
|---------|-------------|
| `npm run export-data [file]` | Export board to JSON (default: `2dobetter-YYYY-MM-DD.json`) |
| `npm run import-data <file>` | Import board from JSON — **replaces all current data** |
| `npm run purge-completed` | Delete completed tasks — all, or older than N days |

### Service

| Command | What it does |
|---------|-------------|
| `npm run restart` | Restart the server (auto-detects launchctl on macOS / systemctl on Linux) |
| `npm run service:install` | Install as auto-start launchd service (macOS) |
| `npm run service:uninstall` | Remove auto-start service (macOS) |

---

## Backup & recovery

Daily encrypted backups run automatically (configured during setup). To restore:

```bash
# 1. Decrypt the backup
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in dev_2026-03-06_03-00-00.db.enc \
  -out restored.db \
  -pass file:~/.2dobetter_backup_key

# 2. Stop the server, replace the DB, restart
systemctl --user stop 2dobetter
cp restored.db ~/2DoBetter/prisma/dev.db
systemctl --user start 2dobetter
```

Or use the built-in import/export for portable JSON backups:
```bash
npm run export-data backup.json          # on the old server
npm run import-data backup.json          # on the new server
```

---

## Deploying updates

```bash
# On the server
cd ~/2DoBetter
git pull
npm run build        # required for UI/API changes
npm run restart      # restarts the service

# CLI-only changes (scripts/, CLAUDE.md) — skip the build:
git pull && npm run restart
```

---

## MCP server (Claude integration)

The included MCP server lets Claude Code read and update your board directly:

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
        "AUTH_TOKEN": "your-token-here",
        "AUTH_USER": "your-username"
      }
    }
  }
}
```

Available MCP tools: `get_board`, `get_column`, `create_task`, `complete_task`, `uncomplete_task`, `update_task`, `delete_task`, `move_task`, `create_list`, `delete_list`, `search_tasks`.

---

## Roadmap

- [x] First-run interactive setup wizard
- [x] Multi-user support with shared board visibility
- [x] Invite-code self-registration (time-limited, single-use)
- [x] JSON export / import for data portability
- [x] Full admin CLI (add/remove/rename/reset users, purge tasks, export/import)
- [x] MCP server for Claude Code integration
- [x] Collapsible teammate columns
- [ ] App Store listing via PWABuilder

---

## Support

2Do Better is free and open source. If it saves you time, a coffee keeps development going:

[![Buy Me a Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/luchegames)

## License

MIT — use it, fork it, ship it. Just don't hold us liable.
