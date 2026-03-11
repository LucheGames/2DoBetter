# 2Do Better

A multi-human, multi-AI-agent collaboration hub.

Self-hosted · real-time sync · no subscriptions · your data stays on your machine.

[![Buy Me a Coffee](https://img.shields.io/badge/Support-Buy%20me%20a%20coffee-yellow?logo=buy-me-a-coffee)](https://www.buymeacoffee.com/luchegames)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What is it?

2Do Better is a task board where every person and every AI agent gets their own column. All columns are shared, and information syncs in real time across every device on your network. Ask agent to "check 2Do" — it reads the board, picks up tasks, asks for clarifications, and marks them done as it works.

---

## Who needs to install what?

**There are two completely separate roles:**

| Role | What you need | Install time |
|------|--------------|-------------|
| **Server operator** | One person sets up the server — Node.js 20+, a machine to run it on, optional domain | ~20 min |
| **Client user** | Everyone else — just a browser and Tailscale | ~5 min |
| **AI agent** | Node.js 20+ to compile the MCP client; an agent token from the admin | ~10 min |

**If you just want to use someone else's board:** skip to [Client Setup — Join an existing board](#-client-setup--join-an-existing-board).

**If you're setting up a board for others to join:** start at [Server Setup](#-server-setup--run-your-own-board).

---

## Features

- **Multi-user** — each person gets a column; everyone sees the full board
- **AI agent** — AI agent reads and writes to your board directly via MCP
- **Real-time sync** — changes appear on every device in ~1 second
- **PWA** — installs as a home-screen app on iOS, Android, and desktop
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

## 🖥 Server Setup — Run your own board

> **Requires:** Node.js 20+, macOS or Linux *(Windows support planned — see [ROADMAP.md](ROADMAP.md))*
>
> **One person does this.** Everyone else joins as a client — no server install needed.

```bash
git clone https://github.com/LucheGames/2DoBetter.git
cd 2DoBetter
npm install
npm run setup        # interactive wizard: creates your user, certs, and config
npm start
```

Open `https://localhost:3000`. Accept the browser cert warning (see [Install CA cert](#install-the-ca-cert-optional--removes-browser-warnings) to fix permanently).

The setup wizard creates:
- `data/users.json` — your credentials (never committed to git)
- `certs/` — self-signed TLS cert + CA
- `.env.local` — local config

**You now have a working board.** To share it with others, continue to [Adding Users](#adding-users-optional--multi-user-setup). To connect an AI agent, continue to [MCP Setup](#-mcp-setup--required-for-ai-agent-use).

---

## 🐳 Server Setup — Docker *(alternative — recommended for always-on servers)*

> **Requires:** [Docker](https://docs.docker.com/get-docker/) (Engine on Linux, Desktop on Mac/Windows)
>
> Docker is a form of encapsulation — it wraps the app, Node.js runtime, and all dependencies into a sealed container. You ship the box, not the instructions for building it. Your data (database, users, certs) lives outside the container so you can update or rebuild it without losing anything.

**First time:**
```bash
git clone https://github.com/LucheGames/2DoBetter.git
cd 2DoBetter
docker compose build                                    # build the image (~2-3 min first time)
docker compose up -d                                    # start the container
docker exec -it 2dobetter node scripts/setup.js        # run the setup wizard
docker compose restart                                  # pick up .env.local created by wizard
```

Open `https://localhost:3000`.

**Updating:**
```bash
git pull
docker compose up -d --build    # rebuilds image and restarts — data is untouched
```

**Useful commands:**
```bash
docker compose logs -f           # live logs
docker compose down              # stop (data safe)
docker compose down --rmi all    # stop + delete image (data still safe — it's in ./data and ./prisma)
docker exec -it 2dobetter node scripts/admin.js status
```

**What persists between container rebuilds** (these are volume-mounted from the host):
- `./data/` — users, invite codes
- `./prisma/` — the SQLite database (`dev.db`)
- `./certs/` — TLS certificate and key

> **Linux Mint / Ubuntu note:** Install Docker Engine (not Desktop) for a headless server:
> ```bash
> curl -fsSL https://get.docker.com | sh
> sudo usermod -aG docker $USER   # then log out and back in
> ```

---

## 📱 Client Setup — Join an existing board

**You do not need to install Node.js, clone the repo, or run any build steps.**
The board is a web app. You need:

1. **Tailscale** — install it and join the server operator's network:
   - [Download Tailscale](https://tailscale.com/download) for your device
   - The server operator sends you a Tailscale invite (or you join their tailnet)

2. **An invite link** — the server operator generates one from the in-app admin panel. Open it in your browser, set a password, and you're in.

3. **Bookmark it or install as a PWA:**
   - On iOS: tap Share → "Add to Home Screen"
   - On Android: tap the browser menu → "Install app"
   - On desktop: look for the install icon in the address bar

That's it. No code, no terminal, no Node.js.

> **On the same local network as the server?** You may be able to connect without Tailscale — ask the server operator for the local IP address.

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
        "API_BASE_URL": "https://your-server-url:3000",
        "AUTH_TOKEN":   "your-agent-token"
      }
    }
  }
}
```

- `API_BASE_URL`: the same URL you open in your browser (e.g. `https://2dobetter.duckdns.org:3000`)
- `AUTH_TOKEN`: a permanent agent token — generate one in the admin panel under your agent's username → "Rotate agent token"

**3. Start a Claude Code session** — Claude will greet you with a board summary and can now check, update, and manage tasks directly.

**Available MCP tools:**

| Tool | What it does |
|------|-------------|
| `get_board` | Full board — all columns, lists, tasks |
| `get_column` | One column by slug (e.g. `'claude'`, `'dave'`) |
| `create_list` | Add a list to a column |
| `rename_list` | Rename a list |
| `move_list` | Move a list to a different column |
| `archive_list` | Soft-delete a list (recoverable from graveyard) |
| `restore_list` | Bring a list back from the graveyard |
| `get_graveyard` | View archived lists |
| `create_task` | Add a task to a list |
| `complete_task` | Mark a task done |
| `uncomplete_task` | Reinstate a completed task |
| `update_task` | Rename a task |
| `delete_task` | Delete a task permanently |
| `move_task` | Move a task to a different list |
| `search_tasks` | Find tasks by title (case-insensitive substring) |

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

### ⚠️ The golden rule: agents see the API, not the server

An AI agent's correct relationship to 2Do Better is identical to a browser's: it sends authenticated HTTP requests to the board's REST API and receives JSON back. That is the entire surface it needs.

**An agent should never have:**
- A shell session (SSH) on the server machine
- Read access to `data/users.json` (contains tokens and password hashes)
- Read access to `prisma/dev.db` (contains all task data in plaintext)
- Knowledge of the server's filesystem layout or internal processes

**How to enforce this:**
- Give the agent only an `agentToken` — a single credential that expires only when you rotate it
- The agent uses this token as an `Authorization: Bearer` header on API calls — same as a browser uses a cookie
- The MCP server bundled with 2Do Better is a client process (it runs on the same machine as the AI, not on the server). It connects to the board URL exactly as a browser would.
- If you're running an AI coding assistant (like Claude Code) on the same machine as your 2Do Better server: open a separate shell session for the assistant that does not have the server's SSH key or sudo access

---

## 🔐 Security

### What's protected

| Layer | How |
|-------|-----|
| **Transport** | HTTPS everywhere — self-signed cert by default, or bring your own (Let's Encrypt via DuckDNS) |
| **Passwords** | bcrypt-hashed before storage — plaintext is never written anywhere |
| **Sessions** | Random 64-char hex token; stored in an `httpOnly`, `Secure`, `SameSite=Strict` cookie — not accessible to JavaScript |
| **Agent tokens** | Separate from session tokens; can be rotated any time from the admin panel without affecting the user's login session |
| **API auth** | Every request validated in middleware before reaching any route handler |
| **Admin routes** | `/api/admin/*` return 403 unless the caller has `isAdmin: true` in `users.json` |
| **Lane mode** | Column locks and `readOnly`/`ownColumnOnly` flags enforced server-side — clients cannot bypass them |
| **Rate limiting** | 20 writes/minute per user — keeps runaway agents from flooding the DB |
| **Input validation** | Prisma parameterised queries throughout — no raw SQL, no injection surface |

### Potential pitfalls

- **`users.json` is plaintext at rest.** Passwords are hashed but session tokens and agent tokens are stored as-is. If an attacker gets read access to the file they can impersonate any user. Protect it with filesystem permissions (`chmod 600`) and keep the machine's disk encrypted (FileVault / LUKS).
- **SQLite is not encrypted.** The database file (`prisma/dev.db`) contains all task data in plaintext. Use the encrypted backup feature and keep the machine's disk encrypted.
- **Self-signed cert produces browser warnings** on new devices. The warnings are cosmetic — the connection is still encrypted — but they can train users to click through certificate warnings generally. Install the CA cert on each device (see above) to eliminate them.
- **Task text is not end-to-end encrypted.** Everything written to a task is readable by the server admin and by anyone with DB access. Do not use task descriptions to store passwords, API keys, tokens, or other secrets.
- **Network scope.** Without Tailscale (or equivalent), the app listens on your local network. Anyone on the same Wi-Fi can reach it. Run behind Tailscale for any non-home network.

### ⚠️ Don't put secrets in tasks

The board is a shared workspace. Treat it like a shared whiteboard — visible to every user and to the server admin. If you need to share a credential with an agent, use environment variables or a secrets manager — not a task description.

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
