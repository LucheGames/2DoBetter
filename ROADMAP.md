# 2Do Better — Roadmap

Planned work, open design decisions, and longer-horizon ideas. Priority-ordered within each section.

---

## Near-Term

- **Scheduled backups without cron** — move the daily backup trigger from crontab into a Node.js `setInterval` inside `server.js`. Removes the only remaining OS-level dependency and is a prerequisite for Windows support.

---

## Windows 10 / 11 Support

**Status:** Planned. Architecture audited. Not started.

The Next.js app, Prisma/SQLite, server.js, and MCP server are all cross-platform Node.js — they run on Windows today without changes. The blocker is the tooling layer.

### What needs changing

| Item | Issue | Planned fix |
|---|---|---|
| `scripts/build.sh` | Bash — won't run on Windows | Replace with `scripts/build.js` (Node.js) |
| `generate-certs.sh` | Bash + openssl CLI | Port to Node.js using `crypto` or `selfsigned` |
| `scripts/setup.js` | Uses `crontab`, `launchctl`, `systemctl` | Add `isWindows` branches |
| `scripts/admin.js` | Uses `launchctl`/`systemctl` for restart/status | Add Windows service detection |
| `scripts/uninstall.js` | No Windows cleanup branch | Add Windows section |

### Open design decisions

1. **HTTPS on Windows** — adding a self-signed CA cert requires `certutil.exe`. Option A: full HTTPS (consistent, more setup friction). Option B: HTTP-only on localhost (browsers grant HTTPS privileges to localhost anyway). *Leaning Option B for v1.*

2. **Auto-start service** — Option A: NSSM (excellent wrapper, separate download). Option B: `sc.exe` + Task Scheduler (built-in, hard to script). Option C: no auto-start for v1 — just `npm start` or a `.bat` shortcut. *Leaning Option C for v1.*

3. **Node.js version management** — nvm-windows is a different tool from nvm. Option A: require Node.js 20+ pre-installed from nodejs.org. Option B: adopt [volta](https://volta.sh/) (cross-platform). Option C: [fnm](https://github.com/Schniz/fnm) (cross-platform, Rust). *Leaning Option A — lowest friction.*

4. **Backup scheduling** — `crontab` doesn't exist on Windows. Once the `setInterval` migration above is done, this goes away entirely.

### Implementation order (when we start)

1. Merge backup scheduling into `server.js` (removes crontab)
2. Replace `build.sh` with `build.js`
3. Port cert generation to Node.js
4. Add `isWindows` branches to `setup.js` and `admin.js`
5. Add Windows cleanup to `uninstall.js`
6. Test end-to-end on a clean Windows 10 install
7. Update README with Windows install instructions

---

## Agent-Agnostic Architecture

**Current state:**

| Layer | Status |
|---|---|
| **Layer 0** — MCP over stdio | ✅ Done — Claude Code, Cursor, local Agents SDK |
| **Layer 1** — OpenAPI spec (`openapi.yaml`) | ✅ Done — Custom GPTs, any HTTP client, API reference |
| **Layer 2** — MCP over HTTP/SSE | 🔲 Planned |
| **Layer 3** — OAuth 2.0 | ⏸ Deferred (hosted tier only) |

MCP is now the industry standard — co-developed by Anthropic, OpenAI, Google, Microsoft, AWS, and others (donated to the Agentic AI Foundation, Dec 2025). Our existing stdio MCP server already works with Claude Code, OpenAI Agents SDK, ChatGPT desktop, Gemini SDK, GitHub Copilot, and more without any changes.

### What's next: Layer 2 — HTTP/SSE transport

Our MCP server currently runs over **stdio** — a local process spawned on the same machine as the AI. This works for local agents (Claude Code, Cursor, a local Gemini CLI session) but not for cloud agents (ChatGPT web, a Gemini web session, a teammate's Copilot).

The MCP spec supports a second transport: **HTTP/SSE**. Adding it lets any agent connect to a remotely running 2DoBetter instance over the network. The MCP SDK already supports both transports; this is a medium-effort addition.

**Network access for cloud agents** — even with HTTP/SSE, a cloud agent can't reach a server behind a home router:

| Option | Effort | Notes |
|---|---|---|
| Tailscale Funnel | Low | Public HTTPS URL to your Tailscale node, no router config |
| Cloudflare Tunnel | Low | Free, stable |
| Hosted option | High | Real answer for non-technical users |

### Remaining implementation steps

1. **Add HTTP/SSE transport to MCP server** — wire existing tools to the SSE transport (~1-2 days)
2. **Document per-agent setup** — guides for OpenAI Agents SDK, Gemini CLI, GitHub Copilot, Custom GPTs (~1 day)
3. **OAuth 2.0** — only if we build a hosted tier

---

## Longer Horizon

### Native App Packaging

**Electron / Tauri wrapper** — package as a proper desktop app (`.exe`, `.dmg`, `.AppImage`) that bundles Node.js, manages its own process lifecycle (no launchd/systemd needed), self-updates, and exposes a system tray icon.

- Electron: ~120 MB, mature and well-documented
- Tauri: ~10 MB, requires Rust tooling to build
- Either lets us ship a proper Windows installer (`.msi`), macOS `.dmg`, and Linux `.AppImage` from the same codebase
- MCP integration unchanged — agent points at the local server the app is running

### Other Ideas

- **Public cloud hosting option** — opt-in hosted tier for users who don't want to self-host, still with data export
- **Plugin system** — let third-party agents register custom MCP tools

---

*Last updated: 2026-03-11*
