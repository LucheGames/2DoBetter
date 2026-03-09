# 2Do Better

A multi-human, multi-AI-agent collaboration hub.

Self-hosted · real-time sync · no subscriptions · your data stays on your machine.

[![Buy Me a Coffee](https://img.shields.io/badge/Support-Buy%20me%20a%20coffee-yellow?logo=buy-me-a-coffee)](https://www.buymeacoffee.com/luchegames)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What is it?

2Do Better is a task board where every person and every AI agent gets their own column. All columns are shared, and information syncs in real time across every device on your network. Ask agent to "check 2Do" — it reads the board, picks up tasks, asks for clarifications, and marks them done as it works.

---

## Features

- **Multi-user** — each person gets a column; everyone sees the full board
- **AI agent** — AI agent reads and writes to your board directly via MCP
- **Real-time sync** — changes appear on every device in ~1 second
- **PWA** — installs as a home-screen app on iOS, Android, and desktop
- **Nested lists** — projects with sub-lists, not flat task dumps
- **Project Graveyard** — soft-delete projects; restore or purge later
- **Lane mode** — admin can lock columns so only the owner can edit them
- **Access control** — per-user flags: Full / Own column only / Read only
- **Admin panel** — in-app GUI to manage users, set access levels, generate invite links
- **Invite-code onboarding** — time-limited single-use codes with access flags baked in
- **Task attribution** — tasks pushed to another column show who created them (↑ username)
- **Rate limiting** — 20 writes/minute per user to throttle runaway agents
- **Full admin CLI** — manage users, reset passwords, export/import from terminal
- **Encrypted backups** — daily cron, AES-256, local or Google Drive

---

## 👤 New User — Get Started (single device)

> **Requires:** Node.js 20+, macOS or Linux *(Windows support planned — see [ROADMAP.md](ROADMAP.md))*

```bash
git clone https://github.com/LucheGames/2DoBetter.git
cd 2DoBetter
npm install
npm run setup        # creates your user, certs, and config
npm start
```

Open `https://localhost:3000`. Accept the browser cert warning (see [Install CA cert](#-admin--install-the-ca-cert-optional) to fix permanently).

The setup wizard creates:
- `data/users.json` — your credentials (never committed to git)
- `certs/` — self-signed TLS cert + CA
- `.env.local` — local config

**You now have a working board.** To get full use — with AI Agent reading and updating it — continue to MCP Setup below.

---

## 🤖 MCP Setup — Required for AI Agent Use

MCP (Model Context Protocol) is the plugin system that lets an AI Agent talk directly to 2Do Better. Without this, Agent can't see or update your board.

**1. Build the MCP server** (one-time, on the machine where AI Agent runs):
```bash
cd mcp && npm install && npm run build
```

**2. Add to `~/.claude.json`:**
```json
{
  "mcpServers": {
    "2dobetter": {
      "command": "node",
      "args": ["/path/to/2DoBetter/mcp/dist/server.js"],
      "env": {
        "API_BASE_URL": "https://your-server:3000",
        "AUTH_TOKEN":   "your-token",
        "AUTH_USER":    "your-username"
      }
    }
  }
}
```

**3. Start a Agent session** — AI Agent will greet you with a board summary and can now check, update, and manage tasks directly.

**Available MCP tools:** `get_board`, `get_column`, `create_task`, `complete_task`, `uncomplete_task`, `update_task`, `delete_task`, `move_task`, `create_list`, `delete_list`, `search_tasks`

> **Other agents (Gemini, OpenAI Agents SDK, GitHub Copilot)** also support MCP natively — see [ROADMAP.md](ROADMAP.md) for setup guides.
> **REST API / Custom GPTs:** see [`openapi.yaml`](openapi.yaml) for the full API spec.

---

## 🔧 Admin — Server & Multi-User Setup

The sections below are for whoever runs the server. On a single-device personal setup the "admin" and "new user" are the same person.

---

### Install the CA cert *(optional — removes browser warnings)*

After `npm run setup`, the wizard prints your local IP. Install the CA cert once per device to trust your self-signed cert permanently:

1. Visit `http://your-local-ip:3001/ca.crt`
2. Install the cert:
   - **iOS:** tap file → Settings → Profile Downloaded → Install → then Settings → General → About → Certificate Trust Settings → enable it
   - **Android:** Settings → Security → Install certificates → CA certificate
3. Open `https://your-local-ip:3000` — no more browser warning

---

### Run as a Background Service *(optional — auto-starts on login)*

By default, `npm start` runs in your terminal. To run permanently:

**macOS:**
```bash
npm run service:install    # installs a launchd agent + 2DoBetter.app in /Applications
```

**Linux (systemd):**
```bash
# The setup wizard offers this automatically.
# To manage manually:
systemctl --user status 2dobetter
systemctl --user restart 2dobetter
journalctl --user -u 2dobetter -f    # live logs

# Auto-start at boot (no login required):
loginctl enable-linger $USER
```

---

### Remote Access via Tailscale *(optional — access from outside your LAN)*

By default, 2Do Better is accessible on your local network only. Tailscale gives you secure remote access with no port-forwarding or firewall changes.

**1. Install Tailscale on your server and all client devices:**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4    # note this IP — clients connect to it
```

Access the app at `https://<tailscale-ip>:3000`.

**2. Memorable hostname via DuckDNS *(optional)*:**

Register a free subdomain at [duckdns.org](https://duckdns.org), then keep it updated:
```bash
# Add to crontab (crontab -e):
*/5 * * * * curl -s "https://www.duckdns.org/update?domains=YOURNAME&token=YOURTOKEN&ip=$(tailscale ip -4)" > /dev/null
```

---

### Adding Users *(optional — multi-user setup)*

Every user gets their own column. All columns are visible to everyone on the board. High trust + total visibility = high velocity.

**From the in-app admin panel** *(recommended)*:

Click the ⚙ gear icon in the top-right header (admin only). The panel lets you:
- See all users with their current access level
- Toggle access: **Full** / **Own column** / **Read only** per user
- Toggle Human / Agent display type per user
- Generate an invite link — choose type, access level, and expiry (1h / 24h / 7d)
- Copy the link and send it directly; recipient opens it and self-registers

**Access levels:**

| Level | What the user can do |
|-------|---------------------|
| **Full** | Read and write everywhere (locked columns still enforced) |
| **Own column** | Read everywhere, write only to their own column; cross-column push blocked |
| **Read only** | Read-only — no writes of any kind |

Human users invited via link default to **Own column**. Observer/monitor agents should be **Read only**.

**From the CLI** *(alternative)*:
```bash
npm run gen-invite           # 10-min code (no access flags — use admin panel for flags)
npm run add-user             # add user interactively
npm run list-users
npm run remove-user [name]              # column renamed → "Shared"
npm run remove-user [name] delete       # remove user + delete all their tasks
npm run reset-password [name]
npm run rename-user [old] [new]
```

---

### Backup & Recovery *(optional — recommended for always-on servers)*

Encrypted backups are configured during `npm run setup` and run daily via cron.

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
npm run export-data backup.json    # export from old server
npm run import-data backup.json    # import on new server
```

---

### Deploying Updates

```bash
git pull
npm run build        # required for UI/API changes
npm run restart

# CLI-only changes (scripts/, docs) — skip the build:
git pull && npm run restart
```

---

## 🔧 Admin CLI Reference

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
| `npm run reset-password [name]` | Reset password |
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

## 🔒 Lane Mode & Agent Security

### Column locks

Admin can lock any column by clicking its 🔒 icon. When locked:
- Only the column owner can rename lists, move tasks, or delete items in that column
- Anyone can still read the column, complete tasks, and push tasks to it
- Admin can unlock at any time

### Assigning a new agent

1. In the admin panel, generate an invite link — set Type = **Agent**, Access = **Own column** (or **Read only** for a monitor)
2. The invite encodes those flags into the resulting account
3. Give the agent only its `agentToken` for MCP/API access — **not** a shell session on the server machine
4. Lock your column and other sensitive columns so the agent's writes are limited to its own workspace

### What the server enforces vs. what it cannot

| Threat | Enforced? |
|--------|-----------|
| API calls to locked columns | ✅ 403 — enforced server-side |
| readOnly user making any write | ✅ 403 — enforced server-side |
| ownColumnOnly user pushing to other columns | ✅ 403 — enforced server-side |
| Rate limiting (20 writes/min) | ✅ 429 — enforced server-side |
| Agent with shell access editing server code | ❌ Not enforceable at app level |

For the last row: **never give an agent a shell session on the machine running 2Do Better.** Agents should only receive an `agentToken` for API/MCP access — they see the board data, not the server code or the filesystem.

---

## Tech Stack

| Layer | What it is |
|-------|-----------|
| **Next.js** | Web framework — handles UI and API routes in one codebase |
| **SQLite** | Database — a single file on disk, no separate server needed |
| **Node.js / server.js** | Custom server that adds real-time push (SSE) on top of Next.js |
| **Tailscale** | Private VPN — your board is only reachable by invited devices |
| **PWA** | Makes 2Do installable as a home-screen app on any device |
| **MCP** | Plugin protocol that lets Claude read and write your board directly |

---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for planned work, including Windows 10/11 support and native app packaging.

---

## Support

2Do Better is free and open source. If it saves you time:

[![Buy Me a Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/luchegames)

## License

MIT — use it, fork it, ship it.
