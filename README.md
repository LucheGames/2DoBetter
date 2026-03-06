# 2Do Better

**Self-hosted, privacy-first todo app. Real-time sync across all your devices. No subscriptions. No tracking. Your data, your server.**

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
- Families or small teams on a home network or Tailscale mesh
- A companion board for AI agent workflows — the built-in MCP server lets Claude read and update tasks directly
- Anyone tired of paying per month for a list app

## Features

- **Real-time sync** across all clients via Server-Sent Events — changes appear instantly on every device
- **PWA** — installable on iOS, Android, and desktop; usable offline
- **Nested lists** — projects with sub-lists, not just flat task lists
- **Encrypted backups** — daily cron job, AES-256 encrypted, uploads to Google Drive or local storage
- **MCP server** — lets Claude Code read and write your board programmatically
- **Tailscale-ready** — access securely from anywhere without opening firewall ports
- **Single-user auth** — simple token-based login, no user database required

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| Database | SQLite via Prisma 6 |
| Real-time | Server-Sent Events |
| Auth | Cookie-based token auth |
| Server | Custom Node.js HTTPS server |
| Backup | rclone + AES-256-CBC encryption |

## Quick start

> **Requirements:** Node.js 20+, a Linux or macOS machine (Raspberry Pi works great)

```bash
git clone https://github.com/LucheGames/2DoBetter.git
cd 2DoBetter
npm install
npm run setup        # interactive first-run wizard
npm start
```

The setup wizard will guide you through:
1. Setting your access passphrase
2. Choosing a backup destination (local / Google Drive / skip)
3. Enabling backup encryption (recommended)
4. Optionally configuring Tailscale for external access

Open the URL shown in your terminal (default `https://localhost:3000`).

> **Note:** 2Do Better generates a self-signed TLS certificate. Your browser will warn you on first visit — this is expected. Install the CA cert once (`https://your-server:3000/download-ca-cert`) and the warning disappears permanently.

## Backup & recovery

Daily encrypted backups run automatically at 3am. To restore:

```bash
# 1. Decrypt
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -in dev_2026-03-06_03-00-00.db.enc \
  -out restored.db \
  -pass file:~/.2dobetter_backup_key

# 2. Replace live DB (stop server first)
systemctl --user stop 2dobetter
cp restored.db ~/2DoBetter/prisma/dev.db
systemctl --user start 2dobetter
```

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
        "AUTH_TOKEN": "your-token-here"
      }
    }
  }
}
```

## Roadmap

- [ ] First-run interactive setup wizard (`npm run setup`)
- [ ] JSON export / import for data portability
- [ ] Multi-user support (separate boards per user)
- [ ] App Store listing via PWABuilder

## Support

2Do Better is free and open source. If it saves you time, a coffee keeps development going:

[![Buy Me a Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/luchegames)

## License

MIT — use it, fork it, ship it. Just don't hold us liable.
