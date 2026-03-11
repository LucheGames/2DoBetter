# 2Do Better

A multi-human, multi-AI-agent collaboration hub.

Self-hosted · real-time sync · no fees / subscriptions · your data stays on your machine.

2Do Better was designed to give agents visability into your projects, allowing you to cue up tasks on the go, and accelerate your AI workflow. Ask your agent to "check 2Do" — it reads the board, picks up tasks, and marks them done as it works. 

2Do Better is bulit from the ground up around MCP (Model Context Protocol), an open-source common standard used by Anthropic, Google and OpenAI for connecting AI applications to external systems.

2Do better works so well that much of 2Do Better was written from inside 2Do Better.

[![Buy Me a Coffee](https://img.shields.io/badge/Support-Buy%20me%20a%20coffee-yellow?logo=buy-me-a-coffee)](https://www.buymeacoffee.com/luchegames)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

Setup

| Role | What you do | Go to |
|------|------------|-------|
| **Admin** | Set up the board, invites / manage users and agents | [Server Admin Setup ↓](#️-server-admin-setup) |
| **Human Client** | Join a board someone else runs | [Human Client Setup ↓](#-human-client-setup) |
| **AI Agent** | Connect Claude / Copilot / etc. to a board | [AI Agent Setup ↓](#-ai-agent-setup) |

---

## 🖥️ Admin Setup

> **One person does this.** Everyone else joins as a client — no server install needed.

### Option A — Docker *(recommended for always-on servers)*

Docker bundles the app and its Node.js runtime into a sealed container. Your data (DB, users, certs) lives outside and survives rebuilds.

Server setup varified on Linux Mint and Ubuntu:**
```bash

# Install Docker Engine
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # then log out and back in
```
macOS / Windows: install [Docker Desktop](https://docs.docker.com/get-docker/).

**First time:**
```bash
git clone https://github.com/LucheGames/2DoBetter.git
cd 2DoBetter
docker compose build                                   # ~2–3 min first time
docker compose up -d
docker exec -it 2dobetter node scripts/setup.js       # first-run wizard
docker compose restart                                 # picks up wizard config
```

Open `https://localhost:3000`.

**Day 2+:**
```bash
git pull && docker compose up -d --build              # update — data untouched
docker compose logs -f                                # live logs
docker exec -it 2dobetter node scripts/admin.js status
```

Data that persists between rebuilds (volume-mounted): `./data/` · `./prisma/` (SQLite DB) · `./certs/`

---

### Option B — Node.js direct

**Prerequisites:** Node.js 20+ ([nvm](https://github.com/nvm-sh/nvm#installing-and-updating) recommended → `nvm install 20`). `git` and `curl` are pre-installed on most Linux/macOS; if not: `sudo apt install git curl`.

```bash
git clone https://github.com/LucheGames/2DoBetter.git
cd 2DoBetter
npm install
npm run setup    # wizard: creates user, certs, .env.local
npm start
```

Open `https://localhost:3000`. Accept the cert warning on first visit, or [install the CA cert](#install-ca-cert) to remove it permanently.

---

### Perform admin functions in admin client or server cli

- **Add users** — ⚙ gear icon → admin panel → Generate invite link. Recipient opens it and self-registers.
- **Remote access** — set up [Tailscale](#remote-access-via-tailscale) on the server; clients join your tailnet.
- **Auto-start** — [run as a background service](#background-service).
- **Remove cert warnings** — [install the CA cert](#install-ca-cert) on each device.

---

## 📱 Human Client Setup

No Node.js, no git, no terminal.

1. **Tailscale** — [download](https://tailscale.com/download) and join the server admin's tailnet.
2. **Invite link** — the admin generates one from the ⚙ gear menu. Open it, set a password, done.
3. **Install as PWA** — iOS: Share → Add to Home Screen · Android: browser menu → Install app · Desktop: install icon in address bar.

> **On the same local network as the server?** Ask the admin for the LAN IP — Tailscale optional.

---

## 🤖 AI Agent Setup

MCP (Model Context Protocol) lets an agent read and write the board directly.

**Prerequisites:** Node.js 20+ on the machine where the AI runs. An agent token from the admin (⚙ gear → agent's column → Rotate agent token).

**1. Build the MCP client** (one-time):
```bash
cd mcp && npm install && npm run build
```

**2. Add to `~/.claude.json`:**
```json
{
  "mcpServers": {
    "2dobetter": {
      "command": "node",
      "args": ["/absolute/path/to/2DoBetter/mcp/dist/server.js"],
      "env": {
        "API_BASE_URL": "https://your-board-url:3000",
        "AUTH_TOKEN":   "your-agent-token"
      }
    }
  }
}
```

**3.** Start a session — the agent greets you with a board summary and can read, update, and complete tasks directly.

**Available tools:**

| Category | Tools |
|----------|-------|
| Board | `get_board` · `get_column` |
| Lists | `create_list` · `rename_list` · `move_list` · `archive_list` · `restore_list` · `get_graveyard` |
| Tasks | `create_task` · `update_task` · `delete_task` · `move_task` · `complete_task` · `uncomplete_task` · `search_tasks` |

> Other agents (Gemini, OpenAI Agents SDK, GitHub Copilot) also support MCP — see [ROADMAP.md](ROADMAP.md).
> REST API / Custom GPTs: see [`openapi.yaml`](openapi.yaml).

**Security note:** The MCP client is a client process — it connects to the board URL via HTTPS, exactly like a browser. The agent should never have SSH access to the server or read access to `data/users.json` / `prisma/dev.db`. Give it only its agent token.

---

## ⚙️ Admin Reference

*Everything below is for the server admin.*

---

### Managing users

**In-app admin panel** — ⚙ gear icon, top-right:
- Generate invite links with access level and expiry baked in
- Toggle access: **Full** / **Own column** / **Read only** · Toggle Human / Agent display
- Reset passwords, rotate agent tokens (hold 2 s)
- Purge completed tasks (all or older than N days)
- Purge graveyard — permanently delete archived lists

**Access levels:**

| Level | What the user can do |
|-------|---------------------|
| **Full** | Read and write everywhere (locked columns still enforced) |
| **Own column** | Read everywhere; write only to their own column |
| **Read only** | No writes |

Human users default to **Own column**. Monitor agents should be **Read only**.

**CLI:**
```bash
npm run add-user
npm run remove-user [name]                     # column renamed → "Shared"
npm run remove-user [name] delete              # remove user + delete tasks
npm run reset-password [name]
npm run rename-user [old] [new]
npm run set-access [name] [full|own|readonly]  # set access level
npm run set-type [name] [human|agent]          # set display type
npm run gen-invite                             # interactive: prompts for expiry, access, type
npm run gen-agent-token [username]             # generate/rotate permanent MCP token
npm run list-users                             # shows access level + type for each user
```

---

### Lane mode

Admin can lock any column (🔒 icon). When locked, only the column owner can rename lists, move tasks, or delete items in it. Anyone can still read, complete tasks, and push tasks to a locked column.

**When assigning a new agent:**
1. Generate an invite — Type = **Agent**, Access = **Own column** (or **Read only** for a monitor)
2. Lock sensitive columns so the agent's writes stay in its own workspace
3. Give the agent only its `agentToken` — not a shell session on the server

---

### Remote access via Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4    # share this IP with clients — they connect to https://<ip>:3000
```

**Memorable hostname** — register a free subdomain at [duckdns.org](https://duckdns.org):
```bash
# crontab -e
*/5 * * * * curl -s "https://www.duckdns.org/update?domains=YOURNAME&token=YOURTOKEN&ip=$(tailscale ip -4)" > /dev/null
```

---

### Install CA cert

Removes the self-signed cert browser warning. Visit `http://your-local-ip:3001/ca.crt`, then:

- **iOS:** tap file → Settings → Profile Downloaded → Install → General → About → Certificate Trust Settings → enable
- **Android:** Settings → Security → Install certificates → CA certificate

---

### Background service

**macOS:**
```bash
npm run service:install
```

**Linux (systemd):**
```bash
systemctl --user status 2dobetter
systemctl --user restart 2dobetter
journalctl --user -u 2dobetter -f      # live logs
loginctl enable-linger $USER           # auto-start at boot, no login required
```

**Uninstall:**
```bash
npm run service:uninstall    # remove auto-start service
npm run uninstall            # full removal — deletes all app data and config from this machine
```

---

### Backup & recovery

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
npm run export-data backup.json    # export
npm run import-data backup.json    # import — replaces all current data
```

---

### Deploying updates

```bash
git pull
npm run build && npm run restart    # required for UI/API changes

# CLI-only changes (scripts/, docs) — skip the build:
git pull && npm run restart
```

---

### Admin CLI quick reference

```bash
npm run status                         # service state, users, task counts, DB size, last backup
npm run list-users                     # all users with admin flag
npm run context                        # git + status + active invites
npm run admin                          # full command list

npm run gen-agent-token [username]     # generate/rotate permanent MCP token
npm run purge-completed                # delete completed tasks (all or older than N days)
npm run purge-graveyard                # permanently delete archived lists

npm run export-data [file]
npm run import-data <file>             # replaces all data — use with caution

npm run restart
npm run service:install
npm run service:uninstall
npm run uninstall                      # full removal — deletes all app data from this machine
```

---

## 🔐 Security

| Layer | How |
|-------|-----|
| Transport | HTTPS everywhere — self-signed cert by default |
| Passwords | bcrypt-hashed; plaintext never written |
| Sessions | Random 64-char hex; `httpOnly`, `Secure`, `SameSite=Strict` cookie |
| Agent tokens | Separate from sessions; rotate any time from admin panel |
| API auth | Every request validated before reaching any route handler |
| Admin routes | 403 unless `isAdmin: true` in `users.json` |
| Lane mode | Column locks and access flags enforced server-side |
| Rate limiting | 20 writes/minute per user — throttles runaway agents |
| Input validation | Prisma parameterised queries — no raw SQL |

**Security Pitfalls:**
- `users.json` tokens are plaintext at rest — `chmod 600` it and encrypt the disk (LUKS / FileVault).
- The SQLite DB contains all task content in plaintext — encrypt the disk, use encrypted backups.
- Task text is visible to the server admin and all DB readers — don't store passwords or API keys in tasks.
- Without Tailscale, the app is reachable to anyone on the same Wi-Fi.

---

## Features

- Multi-user — each person gets a column; everyone sees the full board
- AI agent reads and writes via MCP — ask it to "check 2Do" and it picks up tasks
- Real-time sync — changes appear on every device in ~1 second
- PWA — Progressive Web App client installs on iOS, Android, and desktop
- Project Graveyard — soft-delete lists; restore or purge later
- (Stay In Your) Lane Mode — admin can lock columns so only the owner can edit
- Per-user access control — Full / Own column / Read only
- In-app admin panel — user management, invite links, agent tokens
- Task attribution — tasks pushed to another column show who created them
- Rate limiting — 20 writes/minute per user
- Encrypted backups — daily cron, AES-256

---

## Tech Stack

| Layer | What |
|-------|------|
| Next.js | Web framework — UI and API routes in one codebase |
| SQLite | Database — a single file on disk, no separate server needed |
| Node.js / server.js | Custom server — adds real-time push (SSE) on top of Next.js |
| Tailscale | Private VPN — board reachable only by invited devices |
| PWA | Makes 2Do installable on any device |
| MCP | Plugin protocol for AI agent access |

---

## Roadmap

See [ROADMAP.md](ROADMAP.md).

---

## Support

2Do Better is free and open source. If it saves you time:

[![Buy Me a Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/luchegames)

## License

MIT — use it, fork it, ship it.
