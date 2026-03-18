# 2Do Better

A multi-human, multi-AI-agent collaboration hub.

real-time sync across your devices · no fees / no subscriptions ever · your data stays on your machine

Think through problems and queue up tasks from anywhere, and when you're back in the dev cave just ask your AI agent to "check 2Do" — it reads the board, picks up tasks, and marks them done as it works.

Built from the ground up around [MCP](https://modelcontextprotocol.io) (Model Context Protocol), the open standard used by Anthropic, Google, Microsoft, and OpenAI for connecting AI to external systems, giving teammates and AI agents total visibility into your shared 2Dos. 

[![Buy Me a Coffee](https://img.shields.io/badge/Support-Buy%20me%20a%20coffee-yellow?logo=buy-me-a-coffee)](https://www.buymeacoffee.com/luchegames)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Features

- **Multi-user** — each person gets a column; everyone sees the full board
- **AI agents** — connect Claude, Gemini, Groq, or any MCP-compatible agent
- **Real-time sync** — changes appear on every device in ~1 second (SSE push)
- **PWA** — installs on iOS, Android, and desktop like a native app
- **Lane Mode** — lock columns so only the owner can edit them
- **Per-user access** — Full / Own column / Read only
- **Project Graveyard** — soft-delete lists; restore or purge later
- **Encrypted backups** — daily cron, AES-256
- **In-app admin panel** — user management, invites, agent tokens

---

## Who are you?

| Role | What you need to do | Jump to |
|------|-------------------|---------|
| **Admin** | Set up the server, invite users and agents | [Admin Setup](#admin-setup) |
| **Teammate** | Join an existing board (no terminal needed) | [Teammate Setup](#teammate-setup) |
| **AI Agent** | Connect Claude / Gemini / Groq to a board | [AI Agent Setup](#ai-agent-setup) |

---

## Admin Setup

One person sets up a server. Everyone else connects to it with a browser.

### Prerequisites

| Tool | How to get it |
|------|---------------|
| **git** | Usually pre-installed — `git --version` to check. If missing: `sudo apt install git` (Linux) or [git-scm.com](https://git-scm.com/downloads) (macOS/Windows) |
| **curl** | Usually pre-installed — `sudo apt install curl` if missing |

```bash
cd ~/Documents    # or wherever you keep projects
```

### Choose an install method

| | Docker *(recommended)* | Node.js direct |
|---|---|---|
| **Best for** | Most users, always-on servers | Developers, or if Docker is unavailable |
| **Requires** | Docker only (bundles Node.js) | Node.js 20+ |

---

### Docker install

**1. Install Docker**

Linux:
```bash
sudo apt install -y git curl
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker    # apply group now — or log out and back in
```

macOS / Windows: install [Docker Desktop](https://docs.docker.com/get-docker/).

> If you see *"permission denied"* on any `docker` command, run `newgrp docker` or log out and back in.

**2. Clone and start**

```bash
git clone https://github.com/LucheGames/2DoBetter.git
cd 2DoBetter
mkdir -p data certs prisma
docker compose build
docker compose up -d
docker exec -it 2dobetter node scripts/setup.js    # first-run wizard
docker compose restart
```

> If git asks for a username/password, press **Ctrl+C** and use:
> `git clone --config credential.helper= https://github.com/LucheGames/2DoBetter.git`

Open `https://localhost:3000` and log in.

**Updating:**
```bash
git pull && docker compose up -d --build
```

**Locked out?**
```bash
docker exec -it 2dobetter node scripts/admin.js reset-password <username>
```

---

### Node.js install

**1. Install Node.js 20+** via [nvm](https://github.com/nvm-sh/nvm):
```bash
nvm --version    # already installed? skip to nvm install 20 below
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
```
Close and reopen your terminal, then:
```bash
nvm install 20
```
Windows: use [nvm-windows](https://github.com/coreybutler/nvm-windows).

**2. Clone and start**
```bash
rm -rf 2DoBetter    # remove any previous install first
# Linux: if you deleted the old folder via the file manager it went to Trash, not disk.
# Make sure you are NOT inside ~/.local/share/Trash — run: cd ~ first.
git clone https://github.com/LucheGames/2DoBetter.git
cd 2DoBetter
npm install
npm run setup       # wizard: DB, certs, admin account
npm run build       # ~2-3 min first time
npm start
```

Open `https://localhost:3000`. You will see a certificate warning on first visit — this is normal ([see below](#certificate-warnings)).

**Updating:**
```bash
git pull && npm run build && npm run restart
```

---

### After first run

#### 1. Invite users

Open the ⚙ gear icon (top-right) → **Generate setup code**. Give the 6-digit code to the new user. They enter it on the sign-in page, pick a username and password, and they are in.

Codes expire after 10 minutes.

#### 2. Run as a background service

```bash
npm run service:install    # auto-detects macOS (launchd) or Linux (systemd)
```

#### 3. Connect AI agents

See [AI Agent Setup](#ai-agent-setup) below.

---

### Setting up anywhere access (optional)

By default your board is reachable on the server machine and any device on the same local network. To reach it from anywhere — your phone on cellular, a laptop elsewhere, or a teammate in another city — you need Tailscale.

**Why Tailscale?** It creates an encrypted private network between your devices with no port forwarding, no public IP, and no cloud middleman. Once installed, your phone and server behave as if they are on the same local network, from anywhere in the world.

**Why a certificate warning?** Your server generates its own TLS certificate rather than using a public authority. This keeps setup free and simple with no renewal headaches, but browsers will flag it as untrusted on first visit. You install the certificate once per device — a 2-minute process — and it never shows again. See [Certificate warnings](#certificate-warnings) below.

**Step 1 — Install Tailscale on the server:**
```bash
curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up
tailscale ip -4    # note this IP — e.g. 100.x.x.x
```

**Step 2 — Create a free Tailscale account:** the `tailscale up` command above will print a URL — open it in a browser, sign up, and authenticate the server. All your devices will join the same private network under this account.

**Step 3 — Install Tailscale on every client device:** download from [tailscale.com/download](https://tailscale.com/download) (iOS, Android, Mac, Windows, Linux) and sign in to the same Tailscale account.

Your board is now reachable at `https://YOUR-TAILSCALE-IP:3000` from any device on your Tailscale network.

**Step 4 — DuckDNS (optional):** gives you a free hostname (e.g. `yourname.duckdns.org`) so you don't have to remember a numeric IP.

1. Go to [duckdns.org](https://duckdns.org), sign in, create a subdomain
2. In the **current ip** field, enter your Tailscale IP (e.g. `100.x.x.x`) and click **update ip**
3. Keep it updated automatically — add to `crontab -e` on the server:
   ```
   */5 * * * * curl -s "https://www.duckdns.org/update?domains=YOURNAME&token=YOURTOKEN&ip=$(tailscale ip -4)" > /dev/null
   ```

After this, devices connect via `https://yourname.duckdns.org:3000` instead of the numeric IP.

**Step 5 — Regenerate the certificate:** your server certificate was created during initial setup, before Tailscale existed. Regenerate it so it covers your Tailscale IP and DuckDNS hostname:

```bash
# Node.js — include your DuckDNS domain (Tailscale IP is auto-detected):
CERT_SANS=yourname.duckdns.org npm run regen-certs
npm run restart

# Docker:
docker exec -e CERT_SANS=yourname.duckdns.org 2dobetter bash generate-certs.sh
docker compose restart
```

Skip `CERT_SANS=` if you are not using DuckDNS — the Tailscale IP is included automatically.

The CA certificate does not change, so any device that already installed it does not need to reinstall.

---

### Certificate warnings

Your server uses a locally-generated certificate — free, no expiry headaches, but not trusted by browsers out of the box. Install the CA certificate once per device to remove the warning permanently.

**Quick bypass (all browsers):** click Advanced → Proceed / Accept Risk.

**Permanent fix — install the CA certificate:**

On the device you want to connect from, open this URL in a browser:
- `http://YOUR-SERVER-IP:3001/ca.crt` (replace with your server's LAN IP or Tailscale IP)

Then install it:

| Platform | Steps |
|----------|-------|
| **Chrome / Edge** | Settings → Privacy and security → Security → Manage certificates → Authorities → Import → select `.crt` → trust for websites |
| **Firefox** | Settings → Privacy & Security → Certificates → View Certificates → Authorities → Import → tick "Trust this CA to identify websites" |
| **macOS** | Double-click `.crt` → Keychain opens → find "2DoBetter Local CA" → Trust → Always Trust |
| **Android** | Open the URL in Chrome → download → open notification to install → name it anything |
| **iOS** | Open the URL in Safari → Allow → Settings → Profile Downloaded → Install → then Settings → General → About → Certificate Trust Settings → enable the CA |

---

## Teammate Setup

No terminal, no git, no Node.js required.

1. **Install Tailscale** — download from [tailscale.com/download](https://tailscale.com/download) and join the same account as the server admin. Skip this if you are on the same Wi-Fi as the server.
2. **Get the board URL** — ask the admin (e.g. `https://yourname.duckdns.org:3000`). On the same Wi-Fi without Tailscale? Use the LAN IP: `https://192.168.x.x:3000`.
3. **Enter your setup code** — the admin gives you a 6-digit code. Enter it on the sign-in page, pick a username and password, done.
4. **Install as an app** — iOS: Share → Add to Home Screen. Android: browser menu → Install app. Desktop: install icon in address bar.

---

## AI Agent Setup

Multiple AI agents can connect to your board simultaneously. Each agent gets its own column.

**Create an agent:** ⚙ gear icon → **+ Agent** → copy the token shown.

| Agent | Model | Free tier | Guide |
|-------|-------|-----------|-------|
| **Claude** (MCP) | Claude 3.5+ | Requires API key | [agents/claude/](agents/claude/) |
| **Gemini** | Gemini 2.5 Flash | No card needed | [agents/gemini/](agents/gemini/) |
| **Groq** | Llama 4 Scout | No card needed | [agents/groq/](agents/groq/) |
| **Cerebras** | Qwen 3 235B | No card needed | [agents/cerebras/](agents/cerebras/) |
| **Ollama** | Any local model | Runs locally | [agents/ollama/](agents/ollama/) |

All agents use the same REST API — see [`openapi.yaml`](openapi.yaml) for the full spec.

---

## Admin Reference

The in-app admin panel (⚙ gear icon, top-right) handles most operations: user management, invites, password resets, agent tokens, and purging completed tasks.

The CLI is available for scripting or SSH access.

### CLI commands

> **Docker:** prefix with `docker exec -it 2dobetter` instead of `npm run`:
> ```bash
> docker exec -it 2dobetter node scripts/admin.js status
> docker exec -it 2dobetter node scripts/admin.js reset-password <username>
> ```

| Command | What it does |
|---------|-------------|
| `npm run status` | Service state, users, task counts, DB size |
| `npm run list-users` | All users with access level and type |
| `npm run admin` | Full command list |
| | |
| `npm run add-user` | Add a user interactively |
| `npm run remove-user [name]` | Remove user (column becomes "Shared") |
| `npm run remove-user [name] delete` | Remove user + delete column and tasks |
| `npm run reset-password [name]` | Reset password |
| `npm run rename-user [old] [new]` | Rename user and column |
| `npm run gen-invite` | Generate invite code |
| `npm run gen-agent-token [name]` | Generate/rotate agent token |
| | |
| `npm run purge-completed` | Delete completed tasks (all or older than N days) |
| `npm run export-data [file]` | Export board to JSON |
| `npm run import-data <file>` | Import from JSON (**replaces all data**) |
| | |
| `npm run restart` | Restart server |
| `npm run regen-certs` | Regenerate TLS cert (after adding Tailscale/DuckDNS) |
| `npm run service:install` | Install as auto-start service |
| `npm run service:uninstall` | Remove auto-start service |
| `npm run uninstall` | Full removal |

### Access levels

| Level | Permissions |
|-------|------------|
| **full** | Read/write all columns |
| **own** | Read all, write only own column (default for humans) |
| **readonly** | Read only — good for monitor agents |

### Lane Mode

Lock any column with the lock icon — only the column owner can then edit it. Others can still read it and push tasks to it. Useful for giving an AI agent write access to the board without it touching your column.

### Backup & recovery

Encrypted backups run daily via cron (configured during setup).

```bash
# Restore from encrypted backup:
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in backup.db.enc -out restored.db -pass file:~/.2dobetter_backup_key
systemctl --user stop 2dobetter
cp restored.db ~/2DoBetter/prisma/dev.db
systemctl --user start 2dobetter

# Portable JSON backup:
npm run export-data backup.json
npm run import-data backup.json
```

---

## Security

| Layer | How |
|-------|-----|
| Transport | HTTPS everywhere — Let's Encrypt or self-signed |
| Passwords | bcrypt-hashed; plaintext never stored |
| Sessions | Random 64-char token; secure cookie |
| Agent tokens | Separate from sessions; rotate from admin panel |
| API auth | Every request validated before reaching route handlers |
| Lane mode | Column locks and access flags enforced server-side |
| Rate limiting | Per-user and per-IP rate limits on login and writes |
| Input validation | Parameterised queries (no raw SQL); length limits on all inputs |
| Backups | Encrypted at rest (AES-256) |

**Things to know:**
- `users.json` tokens are plaintext at rest — run `chmod 600` on it and use disk encryption (LUKS / FileVault).
- All board content is visible to every logged-in user — do not store secrets or API keys as tasks.

---

## Tech Stack

| Layer | What |
|-------|------|
| Next.js 16 | Web framework — UI and API in one codebase |
| SQLite + Prisma | Database — single file, no separate server |
| Node.js / server.js | Custom HTTPS server with SSE for real-time push |
| Tailscale | Private VPN — board reachable only by invited devices |
| Self-signed TLS | HTTPS everywhere — CA cert installed once per device |
| PWA | Installable on any device |
| MCP | Open protocol for AI agent access |

---

## Roadmap

See [ROADMAP.md](ROADMAP.md).

---

## Support

2Do Better is free and open source. If it saves you time:

[![Buy Me a Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/luchegames)

## License

MIT — use it, fork it, ship it.
