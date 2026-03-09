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
