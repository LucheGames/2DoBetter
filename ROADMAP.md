# 2Do Better — Roadmap

This file tracks planned work, open design decisions, and longer-horizon ideas.
Items are roughly priority-ordered within each section.

---

## In Progress / Near-Term

- **Scheduled backups without cron** — move the daily backup trigger from crontab into a Node.js `setInterval` inside `server.js`. This removes the only remaining OS-level dependency for Mac/Linux users and is a prerequisite for Windows support.

---

## Windows 10 / 11 Support

**Status:** Planned. Architecture audited. Implementation not started.

### Background

2Do Better's Next.js app, Prisma/SQLite, server.js, middleware, and MCP server are all cross-platform Node.js — they run on Windows today without changes. The blocker is the *tooling layer* around setup and service management.

### What already works on Windows (zero changes needed)

| Component | Why |
|---|---|
| Next.js UI + all React components | Pure JS/TS |
| Prisma + SQLite | Official Windows support |
| `server.js` | Cross-platform Node.js |
| MCP server (`mcp/`) | Pure Node.js |
| Auth, middleware, API routes | TS/Next.js only |

Roughly 90% of the codebase is already Windows-compatible.

### What needs changing

| Item | Issue | Planned fix |
|---|---|---|
| `scripts/build.sh` | Bash script — won't run on Windows | Replace with `scripts/build.js` (Node.js, ~30 lines) |
| `generate-certs.sh` | Bash + openssl CLI | Port to `scripts/generate-certs.js` using Node `crypto` or `selfsigned` npm package |
| `scripts/setup.js` | Uses `crontab`, `launchctl`, `systemctl`, `which`, `process.getuid()` | Add `isWindows` branches; skip/replace each |
| `scripts/admin.js` | Uses `launchctl`/`systemctl` for restart/status | Add Windows service detection |
| `scripts/uninstall.js` | No Windows cleanup branch | Add Windows section (Task Scheduler removal, service removal) |

### Open design decisions (need answers before implementation)

1. **HTTPS on Windows?**
   - Full HTTPS requires adding a self-signed CA cert to the Windows trust store via `certutil.exe` — doable but adds setup friction
   - Option A: Full HTTPS (same as Mac/Linux) — consistent but harder to set up
   - Option B: HTTP-only on `localhost` for Windows — browsers grant HTTPS privileges to localhost anyway; simpler setup
   - *Leaning toward Option B for v1, with HTTPS as an opt-in later*

2. **Auto-start service on Windows?**
   - Option A: [NSSM](https://nssm.cc/) — excellent service wrapper, but requires a separate download
   - Option B: `sc.exe` + Task Scheduler — built-in, no downloads, much harder to script correctly
   - Option C: No auto-start for Windows v1 — just `npm start`, or a `.bat` shortcut on the desktop
   - *Leaning toward Option C for v1 — simpler, common enough on Windows*

3. **Node.js version management?**
   - nvm and nvm-windows are entirely different tools with different commands
   - Option A: Require Node.js 20+ pre-installed (from nodejs.org) — build script calls `node` from PATH
   - Option B: Adopt [volta](https://volta.sh/) across all platforms — cross-platform, has a Windows installer
   - Option C: Use [fnm](https://github.com/Schniz/fnm) — cross-platform, written in Rust
   - *Leaning toward Option A for v1 — lowest friction, no new tool dependency*

4. **Backup scheduling?**
   - `crontab` doesn't exist on Windows
   - Once the `setInterval` migration (above) is done, this problem goes away entirely
   - *Prerequisite: complete the "Scheduled backups without cron" item first*

5. **Port conflict** — developers on Windows frequently have `localhost:3000` occupied by other projects. The default port should be configurable at setup time on all platforms (it already is via `--port`), but the setup wizard should prompt for it more explicitly.

### Implementation plan (when we start)

1. Merge backup scheduling into `server.js` (removes crontab dependency)
2. Replace `build.sh` with `build.js`
3. Port cert generation to Node.js
4. Add `isWindows` branches to `setup.js` and `admin.js`
5. Add Windows cleanup to `uninstall.js`
6. Test end-to-end on a clean Windows 10 install
7. Update README with Windows install instructions

---

## Agent-Agnostic Architecture

**Status:** Planned. Research complete. No implementation started.

### The headline

MCP has become the industry standard — and it isn't just Anthropic's protocol anymore. In December 2025, Anthropic donated MCP to the **Agentic AI Foundation** (a Linux Foundation fund), co-founded with **OpenAI, Block, Google, Microsoft, AWS, Cloudflare, and Bloomberg**. Every major AI platform now supports or is actively adopting it.

**This means our existing MCP server already works — without any code changes — with:**

| Agent / Platform | MCP Support | Notes |
|---|---|---|
| Claude Code | ✅ Native | Current setup — stdio transport |
| OpenAI Agents SDK | ✅ Native | MCP as first-class citizen since March 2025 |
| ChatGPT (desktop/web) | ✅ Native | Full MCP rollout, Oct 2025 |
| Google Gemini SDK | ✅ Native | Built-in MCP with auto tool calling |
| Vertex AI / ADK | ✅ Native | Google-managed MCP servers in Cloud |
| GitHub Copilot | ✅ Tools only | MCP tools work; resources/prompts not yet |
| LangChain, CrewAI | ✅ Via integration | MCP adapters available |
| Microsoft Semantic Kernel | ✅ Native | MCP supported |
| **Custom GPTs** | ❌ OpenAPI only | Still uses OpenAPI Actions, not MCP |

We already built the right thing. We're roughly 80% of the way there today.

---

### The gaps

**Gap 1 — Custom GPTs (OpenAPI Actions)**

Custom GPTs don't support MCP. They use OpenAPI 3.0 schemas to define external API calls. Our REST API (the Next.js API routes) is already there — we just need to write an `openapi.yaml` that documents it. This is documentation work, not engineering work. Any agent that can make an HTTP request can use the REST API directly regardless of MCP.

**Gap 2 — Transport: stdio vs HTTP/SSE**

Our MCP server currently runs over **stdio** — it's a local process that Claude Code spawns on the Mac. This is fine for locally-running agents (Claude Code, Cursor, a local Gemini CLI session). But cloud-based agents (ChatGPT web, a Gemini web session, a teammate's Copilot) can't reach a stdio process.

The MCP spec supports a second transport: **HTTP/SSE** (Server-Sent Events). Adding this would let any agent connect to a remotely running 2DoBetter instance over the network — the same way a browser connects. The MCP SDK supports both transports; it's a medium-effort addition.

**Gap 3 — Network access for cloud agents**

Even with HTTP/SSE transport, a cloud agent can't reach a server sitting behind a home router. Solutions (in order of simplicity):

| Option | Effort | Notes |
|---|---|---|
| Tailscale Funnel | Low | Public HTTPS URL to your Tailscale node, no router config |
| Cloudflare Tunnel | Low | Free, stable, same idea |
| ngrok | Very low | Good for dev/demo, less good for always-on |
| Hosted option | High | Real answer for non-technical users — see below |

**Gap 4 — Auth for non-Claude agents**

The `agentToken` system works fine for any agent that can set an HTTP header. No changes needed for local agents. For cloud agents calling the REST API or MCP over HTTP, they'd use the same bearer token in the `Authorization` header or the MCP env config. This is already supported.

If we want **per-agent identity** (know which agent took which action, revoke access per agent without affecting others), we'd need OAuth 2.0 — a significant complexity jump that probably only makes sense if we go hosted.

---

### Three-layer architecture (recommended)

```
┌─────────────────────────────────────────────────┐
│  Layer 3: OAuth 2.0  (future / hosted only)     │
│  Per-agent identity, revocable tokens           │
├─────────────────────────────────────────────────┤
│  Layer 2: MCP over HTTP/SSE  (medium-term)      │
│  Remote agents, cloud platforms, teammates      │
├─────────────────────────────────────────────────┤
│  Layer 1: OpenAPI spec  (near-term, low effort) │
│  Custom GPTs, universal docs, any HTTP client   │
├─────────────────────────────────────────────────┤
│  Layer 0: MCP over stdio  (EXISTS TODAY)        │
│  Claude Code, Cursor, local Agents SDK, etc.    │
└─────────────────────────────────────────────────┘
              ↕ all layers hit the same REST API
```

---

### Pros and cons

**Option A — MCP stdio only (current state)**

| Pros | Cons |
|---|---|
| Already built and working | Doesn't cover Custom GPTs |
| Covers most developer tools and IDEs | Only works for locally-running agents |
| Protocol is now industry standard | Cloud agents need HTTP transport |
| Zero additional maintenance | |

**Option B — Add OpenAPI spec (Layer 1)**

| Pros | Cons |
|---|---|
| Covers Custom GPTs | Two interfaces to document (but same underlying API) |
| Universal — any HTTP client works | Agents get less "rich" tool discovery than MCP |
| Very low effort (docs, not code) | |
| Also serves as developer API reference | |
| Enables future SDK generation | |

**Recommended next step.** Low effort, high payoff.

**Option C — Add HTTP/SSE MCP transport (Layer 2)**

| Pros | Cons |
|---|---|
| Same rich MCP tools, now accessible remotely | Security surface increases |
| Cloud agents (ChatGPT, Gemini web) can connect | Needs auth hardening for public internet |
| Teammates can use their own agents on shared board | Requires Tailscale Funnel or similar for reachability |
| One protocol for all agents | Medium implementation effort |

**Worth doing after Layer 1.** Unlocks the really interesting multi-agent use cases — two people with different AI agents both working the same board simultaneously.

**Option D — OAuth 2.0 (Layer 3)**

| Pros | Cons |
|---|---|
| Proper per-agent identity and audit trail | Significant implementation complexity |
| Revoke one agent without affecting others | Probably only worth it for a hosted product |
| Industry-standard for third-party integrations | Most self-hosters won't need this |

**Defer until hosted product.** Overkill for self-hosted.

---

### Implementation order

1. **Write `openapi.yaml`** — document existing REST API routes, authentication, and response shapes. No code changes. Enables Custom GPTs and serves as API reference. (~1 day)
2. **Add `gen-agent-token` to UI** — let users generate tokens for specific agents from the web UI, not just the CLI. (~half day)
3. **Add HTTP/SSE transport to MCP server** — wire the existing MCP tools up to the SSE transport the SDK already supports. (~1-2 days)
4. **Document per-agent setup** — write setup guides for Claude Code, OpenAI Agents SDK, Gemini CLI, GitHub Copilot, Custom GPTs. (~1 day)
5. **OAuth 2.0** — only if we build a hosted tier.

---

## Longer Horizon

### Native App Packaging

**Electron / Tauri wrapper** — package 2Do Better as a proper desktop app (`.exe`, `.dmg`, `.AppImage`) that:
- Bundles Node.js — no prerequisite installs
- Manages its own process lifecycle (no launchd/systemd/NSSM needed)
- Self-updates
- Exposes a system tray icon
- Handles port selection automatically (no conflicts with other dev servers)

This is the real answer to cross-platform distribution for a developer audience. The web app core stays unchanged — the wrapper just manages the Node process and opens a browser window (or an embedded WebView).

**Considerations:**
- Electron adds ~120 MB to the install size but is mature and well-documented
- Tauri is much smaller (~10 MB) but requires Rust tooling to build
- Either approach lets us ship a proper Windows installer (`.msi` / NSIS), a macOS `.dmg`, and a Linux `.AppImage` from the same codebase
- MCP integration would still work — the agent just points at the local server the app is running

**Port conflict strategy for packaged app:** bind to a fixed high port (e.g. `42000`) that is unlikely to be in use, or auto-detect a free port and write it to a local config file that the MCP server reads.

### Other Ideas

- **Mobile companion app** — read-only board view as a native iOS/Android app (PWA already covers most of this)
- **Public cloud hosting option** — opt-in hosted tier for users who don't want to self-host, still with data export
- **Plugin system** — let third-party agents register custom MCP tools

---

*Last updated: 2026-03-09*
