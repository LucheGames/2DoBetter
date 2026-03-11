# 2Do Better — Roadmap

What's coming, roughly in priority order.

---

## Near-Term

- **Scheduled backups without cron** — move the daily backup trigger into Node.js (`server.js`). Removes the last OS-level dependency and unblocks Windows support.

---

## Windows Support

The core app (Next.js, SQLite, MCP) already runs on Windows. The blockers are a handful of Bash scripts and OS-specific service commands.

<details><summary>Implementation notes</summary>

- Replace `build.sh` and `generate-certs.sh` with Node.js equivalents
- Add `isWindows` branches to `setup.js`, `admin.js`, `uninstall.js`
- HTTPS: use HTTP-only on localhost for v1 (browsers grant HTTPS privileges to localhost)
- Auto-start: skip for v1 — just `npm start` or a `.bat` shortcut
- Require Node.js 20+ pre-installed from nodejs.org (no nvm-windows dependency)
- Test end-to-end on a clean Windows 10 install, then add README instructions

</details>

---

## Agent-Agnostic Architecture

| Layer | Status |
|---|---|
| **Layer 0** — MCP over stdio | ✅ Done — Claude Code, Cursor, Agents SDK |
| **Layer 1** — OpenAPI spec | ✅ Done — Custom GPTs, any HTTP client |
| **Layer 2** — MCP over HTTP/SSE | 🔲 Planned |
| **Layer 3** — OAuth 2.0 | ⏸ Deferred (hosted tier only) |

**Next up: Layer 2 — HTTP/SSE transport.** Our MCP server currently runs as a local process. Adding HTTP/SSE lets cloud agents (ChatGPT web, Gemini web, a teammate's Copilot) connect remotely. The MCP SDK already supports both transports.

Cloud agents also need a way through home routers — Tailscale Funnel or Cloudflare Tunnel are the lowest-friction options.

<details><summary>Implementation notes</summary>

- Wire existing MCP tools to the SSE transport adapter (~1–2 days)
- Write per-agent setup guides: OpenAI Agents SDK, Gemini CLI, GitHub Copilot, Custom GPTs
- OAuth 2.0 only matters if we build a hosted tier

</details>

---

## Longer Horizon

- **Desktop app packaging** — Electron or Tauri wrapper so users get a `.exe` / `.dmg` / `.AppImage` with bundled Node.js, system tray icon, and auto-updates. No launchd/systemd needed.
- **Hosted option** — opt-in cloud tier for users who don't want to self-host, with full data export.
- **Plugin system** — let third-party agents register custom MCP tools.

---

*Last updated: 2026-03-11*
