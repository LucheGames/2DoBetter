# 2Do Better

A multi-human, multi-AI-agent collaboration hub.

real-time sync across your devices · no fees / no subscriptions ever · your data stays on your machine

We are entering a new era of human machine colaboration, where the new bottleneck to development is not implemmentation but the speed at which we can articulate our ideas. 2Do Better unlocks your productivity by allowing you to to think through problems and solutions from anywhere, cue up tasks on your mobile device, and when your are back in your dev cave simply ask your agent to "check 2Do" — it reads the board, picks up tasks, and marks them done as it works. 

2Do Better was designed to give agents total visibility into your projects, built from the ground up around MCP (Model Context Protocol), an open-source common standard used by Anthropic, Google, Microsoft, and OpenAI for connecting AI applications to external systems. 2Do better's design philosophy is: total visability, allowning your team to see, add, and implement ideas at maximum speed.


[![Buy Me a Coffee](https://img.shields.io/badge/Support-Buy%20me%20a%20coffee-yellow?logo=buy-me-a-coffee)](https://www.buymeacoffee.com/luchegames)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Common prerequisites

You'll need a few standard tools before you start:

| Tool | What it's for | How to get it |
|------|--------------|---------------|
| **Terminal** | Running commands | Built into Linux and macOS · Windows: search for **cmd** or **PowerShell** in the Start menu |
| **git** | Downloading the app | Usually pre-installed — check with `git --version` · if missing: `sudo apt install git` (Linux) · [git-scm.com](https://git-scm.com/downloads) (macOS/Windows) |
| **curl** | Running install scripts | Usually pre-installed — check with `curl --version` · if missing: `sudo apt install curl` |

Before running any commands, navigate to where you want to install the app:
```bash
cd ~/Documents    # or wherever you keep your projects
```

---

## Setup

| Role | What you do | Go to |
|------|------------|-------|
| **Admin** | Set up the board, invites / manage users and agents | [Admin Setup ↓](#️-admin-setup) |
| **Teammate** | Join an existing board | [Human Client Setup ↓](#-human-client-setup) |
| **AI Agent** | Connect Claude / Copilot / etc. to a board | [AI Agent Setup ↓](#-ai-agent-setup) |

---

## 🖥️ Admin Setup

> **One person does sets up a server .** Everyone else joins this server as a client.

**Choose your install method:**

| | Option A — Docker | Option B — Node.js direct |
|---|---|---|
| **Best for** | Most users, always-on servers | Developers, or if Docker isn't available |
| **Requires** | Docker (bundles Node.js — nothing else) | Node.js 20+ installed separately |

---

### Option A — Docker *(recommended)*

Docker bundles Node.js and the app into a sealed container — **no separate Node.js install needed.** Your data (DB, users, certs) lives outside and survives rebuilds.

**1. Install prerequisites**

Linux Mint / Ubuntu:
```bash
sudo apt install -y git curl               # usually pre-installed — safe to re-run
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker                              # activates Docker group immediately — or log out and back in
```
> ⚠️ If you see **"permission denied while trying to connect to the Docker daemon"** it means the group change hasn't taken effect yet. Run `newgrp docker` in your terminal, or log out and back into your desktop session, then continue.

macOS / Windows: install [Docker Desktop](https://docs.docker.com/get-docker/) (includes Docker Compose). Git for macOS comes with Xcode Command Line Tools — run `git` in the terminal and follow the prompt.

**2. Clone and start:**

> No GitHub account needed — the repo is public. If git asks for a username or password, press **Ctrl+C** and use this instead:
> ```bash
> git clone --config credential.helper= https://github.com/LucheGames/2DoBetter.git
> ```

```bash
git clone https://github.com/LucheGames/2DoBetter.git
cd 2DoBetter
mkdir -p data certs prisma                             # pre-create so Docker doesn't own them as root
docker compose build                                   # ~2–3 min — terminal returns when done
docker compose up -d                                   # -d runs in background, keeps terminal free
docker exec -it 2dobetter node scripts/setup.js       # first-run wizard: DB migration, certs, user setup
docker compose restart                                 # picks up wizard config
```

Open `https://localhost:3000`.

**Updating:**
```bash
git pull && docker compose up -d --build              # pull latest + rebuild image — your data is untouched
docker compose logs -f                                # live logs
docker exec -it 2dobetter node scripts/admin.js status
```

Data that persists between rebuilds (volume-mounted): `./data/` · `./prisma/` (SQLite DB) · `./certs/`

**Changing the port** (if 3000 is already in use on your machine):
1. Edit `docker-compose.yml` — change both `"3000:3000"` → `"4000:4000"` and `"3001:3001"` → `"4001:4001"`
2. Edit `.env.local` — add `PORT=4000`
3. `docker compose up -d --build`

The setup wizard will also remind you of this if you choose a non-default port during first-run setup.

---

### Option B — Node.js direct

**1. Install Node.js 20+** via [nvm](https://github.com/nvm-sh/nvm) (Linux / macOS):
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
```
Close and reopen your terminal, then:
```bash
nvm install 20
```
Windows: use [nvm-windows](https://github.com/coreybutler/nvm-windows).

**2. Clone and start:**

> No GitHub account needed — the repo is public. If git asks for a username or password, press **Ctrl+C** and use this instead:
> ```bash
> git clone --config credential.helper= https://github.com/LucheGames/2DoBetter.git
> ```

```bash
git clone https://github.com/LucheGames/2DoBetter.git
cd 2DoBetter
npm install
npm run setup    # wizard: DB migration, TLS certs, user setup, .env.local
npm run build    # compile Next.js (~2–3 min first time)
npm start
```

Open `https://localhost:3000`. Accept the cert warning on first visit, or [install the CA cert](#install-ca-cert) to remove it permanently.

---

### After first run

- **Add users** — ⚙ gear icon → admin panel → Generate invite link. Recipient opens it and self-registers.
- **Remote access** — set up [Tailscale](#remote-access) on the server; clients join your tailnet.
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

**Available API tools:**

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

In-app admin panel: **⚙ gear icon** (top-right). Everything in the panel is also available from the CLI.

### CLI commands

| Command | What it does |
|---------|-------------|
| `npm run status` | Service state, users, task counts, DB size, last backup |
| `npm run list-users` | All users with access level and type |
| `npm run context` | Git + status + active invites |
| `npm run admin` | Full command list |
| — | — |
| `npm run add-user` | Add a user interactively |
| `npm run remove-user [name]` | Remove user — column renamed to "Shared" |
| `npm run remove-user [name] delete` | Remove user + delete their column and all tasks |
| `npm run reset-password [name]` | Reset password |
| `npm run rename-user [old] [new]` | Rename user and their column |
| `npm run set-access [name] [full\|own\|readonly]` | Set access level (see below) |
| `npm run set-type [name] [human\|agent]` | Set display type |
| `npm run gen-invite` | Generate invite — prompts for expiry, access, type |
| `npm run gen-agent-token [username]` | Generate/rotate permanent MCP token |
| — | — |
| `npm run purge-completed` | Delete completed tasks (all or older than N days) |
| `npm run purge-graveyard` | Permanently delete archived lists |
| `npm run export-data [file]` | Export board to JSON |
| `npm run import-data <file>` | Import from JSON — **replaces all data** |
| — | — |
| `npm run restart` | Restart the server |
| `npm run service:install` | Install auto-start service |
| `npm run service:uninstall` | Remove auto-start service |
| `npm run uninstall` | Full removal — deletes all app data from this machine |

**Access levels:** `full` = read/write everywhere · `own` = read everywhere, write only own column · `readonly` = no writes. Human users default to `own`. Monitor agents should be `readonly`.

**Lane mode:** Admin can lock any column (🔒 icon) — only the column owner can then edit it. Anyone can still read and push tasks to a locked column. Lock your column before assigning an agent write access to the board.

---

### Remote access

```bash
curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up
tailscale ip -4    # clients connect to https://<this-ip>:3000
```

**Optional — memorable hostname via [DuckDNS](https://duckdns.org)** (add to `crontab -e`):
```
*/5 * * * * curl -s "https://www.duckdns.org/update?domains=YOURNAME&token=YOURTOKEN&ip=$(tailscale ip -4)" > /dev/null
```

---

### Browser cert warning

When you first open the app you'll see a security warning. **This is normal and safe** — your browser doesn't recognise your self-signed certificate yet. The cert was generated for your private server; no one else can use it.

---

#### Step 1 — Find your server's IP address

You'll need this to connect from phones and other devices on the same network.

On the server machine, run:
```bash
hostname -I       # Linux / Mac
ipconfig          # Windows — look for IPv4 Address
```
Use that IP (e.g. `192.168.1.42`) wherever you see `YOUR-SERVER-IP` below.

---

#### Step 2 — Install the CA cert (removes warnings forever)

Download the CA cert from the server — open this URL on the device you want to trust it on:

| Device | URL |
|--------|-----|
| Same machine as server | `http://localhost:3001/ca.crt` |
| Phone / other device | `http://YOUR-SERVER-IP:3001/ca.crt` |

Then follow the steps for your browser or device:

**Firefox (desktop) — required, Advanced button does nothing without this**
1. Download the file above
2. Firefox menu → Settings → Privacy & Security → scroll to **Certificates** → click **View Certificates**
3. **Authorities** tab → **Import** → select the downloaded `.crt` file
4. Tick **"Trust this CA to identify websites"** → OK
5. Reload `https://localhost:3000` — no more warning

**Chrome / Brave / Edge (desktop)**
One-time bypass (no install needed): click **Advanced** → **Proceed to [address] (unsafe)**

Permanent fix (no warning ever again):
- **Windows/Linux:** Settings → Privacy and security → Security → **Manage certificates** → Authorities → Import → select the `.crt` file → trust for websites
- **Mac:** double-click the downloaded `.crt` → Keychain opens → find "2DoBetter Local CA" → double-click → Trust → set "When using this certificate" to **Always Trust**

**Android (Samsung / Chrome mobile)**
1. In Chrome on the phone, open `http://YOUR-SERVER-IP:3001/ca.crt`
2. It will download — open the notification to install it
3. Name it anything (e.g. `2DoBetter`) → OK
4. If Chrome still warns: Settings → Security → Encryption & credentials → Trusted credentials → User tab — confirm it's listed
5. Open `https://YOUR-SERVER-IP:3000` in Chrome

> **Samsung Internet browser** has its own cert store. Use Chrome on Android for the smoothest experience.

**iOS (Safari)**
1. On the iPhone, open `http://YOUR-SERVER-IP:3001/ca.crt`
2. Safari prompts to download — tap Allow
3. Go to **Settings** → **Profile Downloaded** → **Install** (top right) → enter passcode → Install again
4. Then go to **Settings** → **General** → **About** → **Certificate Trust Settings** → toggle on the 2DoBetter CA
5. Open `https://YOUR-SERVER-IP:3000` in Safari

---

### Background service

```bash
npm run service:install          # macOS (launchd) and Linux (systemd) — installs and starts
journalctl --user -u 2dobetter -f   # Linux — live logs
```

---

### Backup & recovery

Encrypted backups run daily via cron (configured during setup).

```bash
# Restore from encrypted backup:
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in backup.db.enc -out restored.db -pass file:~/.2dobetter_backup_key
systemctl --user stop 2dobetter
cp restored.db ~/2DoBetter/prisma/dev.db
systemctl --user start 2dobetter

# Portable JSON backup (easier for migrations):
npm run export-data backup.json
npm run import-data backup.json    # replaces all current data
```

---

### Deploying updates

```bash
git pull && npm run build && npm run restart    # UI/API changes
git pull && npm run restart                     # CLI/docs changes only
```

---

## 🔐 Security

| Layer | How |
|-------|-----|
| Transport | HTTPS everywhere — self-signed cert by default |
| Passwords | bcrypt-hashed; plaintext never written |
| Sessions | Random 64-char token; secure cookie |
| Agent tokens | Separate from sessions; rotate any time from admin panel |
| API auth | Every request validated before reaching any route handler |
| Lane mode | Column locks and access flags enforced server-side |
| Rate limiting | 20 writes/minute per user — throttles runaway agents |
| Input validation | Parameterised queries — no raw SQL |
| SQLite backups | Encrypted at rest |

**Security Pitfalls:**
- `users.json` tokens are plaintext at rest — `chmod 600` it and encrypt the disk (LUKS / FileVault).
- The SQLite DB on server contains all task content in plaintext.
- All board information is visible to every user — don't store secrets, passwords or API keys.

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
