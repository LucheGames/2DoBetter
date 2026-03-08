# 2 Do Better — Claude Instructions

---
## ⚠️  ABSOLUTE RULE — NEVER COMMIT SECRETS ⚠️

**STOP. Before every `git add` or `git commit`, ask yourself:**
- Does any staged file contain a password, token, API key, connection string, or credential?
- Is `.env` or `.env.local` staged? (They must ALWAYS be in `.gitignore`)

**Files that MUST NEVER be committed:**
- `.env`, `.env.local`, `.env.*` (any environment files with real values)
- `data/users.json` (contains bcrypt hashes and session tokens)
- `certs/` (TLS private keys)
- Any file with a real `DATABASE_URL`, `AUTH_TOKEN`, API key, password, or secret

**Why this matters:** This repo is public. Credentials committed to git are permanently exposed — even after deletion, they live in history and are indexed by secret scanners within minutes.

**History note:** The initial commit accidentally committed `.env` with a Railway MySQL password. The history was scrubbed with `git filter-repo` on 2026-03-08. Don't make us do that again.

**If you accidentally commit a secret:** Immediately rotate/revoke the credential — assume it is compromised. Then scrub with `git filter-repo --replace-text`.

---

## Session Start (do this automatically, no need to ask)

1. **Run `npm run context`** from `~/2DoBetter/` on this Mac — dumps git branch, last 5 commits, server health, user count, board stats, active invite codes, and last backup in one shot.
2. **Check the board** with the `get_board` MCP tool.
3. **Greet Dave with a 1-line board status** — e.g. "Board: 3 open in Dave's queue, 1 in mine (admin CLI, done). Server running, last backup 9h ago."

---

## Architecture — Three Machines

| Machine | Role | Address |
|---------|------|---------|
| **Mac** (this one) | Dev + git origin | `100.106.235.14` (Tailscale) |
| **Ubuntu HP Z2** | Production server | `davistator@100.105.251.44` (Tailscale) · `192.168.10.165` (LAN) |
| **Android phone** | Client (PWA) | connects to Ubuntu via Tailscale |

- **App URL:** `https://2dobetter.duckdns.org:3000` — works anywhere Tailscale is running
- DuckDNS `2dobetter.duckdns.org` → Tailscale IP `100.105.251.44` (Ubuntu), refreshed every 5 min via cron
- Ubuntu `/etc/hosts`: `127.0.0.1 2dobetter.duckdns.org` (avoids Tailscale hairpin for local access)
- Ubuntu static LAN IP via netplan: `192.168.10.165`
- **Mac is client-only** — no local service; `.app` launcher opens `https://2dobetter.duckdns.org:3000`
- **DB lives on Ubuntu** — `~/2DoBetter/prisma/dev.db` (SQLite, gitignored). The Mac has no live database.

---

## Node Version — Critical Gotcha

| Context | Node version | Notes |
|---------|-------------|-------|
| System (`/usr/bin/node`) | **v10** | Old, installed by package manager |
| nvm (`~/.nvm/versions/node/v20…`) | **v20** | What Next.js needs |
| CLI scripts (`setup.js`, `admin.js`) | Runs on system node v10 | **No optional chaining `?.`, no `??`** |
| `npm run build` | Auto-uses nvm v20 | `scripts/build.sh` handles this |

**SSH commands need `bash -i -c '…'` to load nvm:**
```bash
ssh davistator@100.105.251.44 "bash -i -c 'cd ~/2DoBetter && npm run build'"
# plain `ssh … "npm run build"` fails — npm not in PATH in non-interactive shells
```

---

## Deploy Workflow

```bash
# 1. On Mac — commit and push
git add <files> && git commit -m "message" && git push

# 2. On Ubuntu — pull, build, restart
ssh davistator@100.105.251.44 "bash -i -c 'cd ~/2DoBetter && git pull && npm run build'"
ssh davistator@100.105.251.44 "bash -i -c 'cd ~/2DoBetter && node scripts/admin.js restart'"

# Or combined:
ssh davistator@100.105.251.44 "bash -i -c 'cd ~/2DoBetter && git pull && npm run build && node scripts/admin.js restart'"
```

**When to skip the build** (CLI-only changes to `scripts/`, `CLAUDE.md`, `.gitignore`):
```bash
ssh davistator@100.105.251.44 "bash -i -c 'cd ~/2DoBetter && git pull && node scripts/admin.js restart'"
```

Ubuntu service management:
```bash
systemctl --user status 2dobetter
journalctl --user -u 2dobetter -n 100 -f   # live logs
```

---

## Auth System

- **Multi-user.** Users stored in `data/users.json` on the server (gitignored, chmod 600).
- **Login:** username + token (password) → `auth_user` + `auth_token` cookies.
- **Middleware** matches *both* cookies — prevents collision when two users share a password.
- **ENV:** `AUTH_USERS_JSON` in `.env.local` is updated when users are added/removed; the live process reads `data/users.json` directly at request time (no restart needed for new users).
- **Invite codes:** `INVITE_CODE=enabled` in `.env.local` turns on the registration page. Actual codes are time-limited, single-use, stored in `data/invites.json`. Generate with `npm run gen-invite`.

---

## Key Files

| File | Purpose |
|------|---------|
| `app/page.tsx` | Main board UI, column sorting (own → agent → teammates) |
| `app/components/ColumnPanel.tsx` | Column + task rendering, YOU/TEAMMATE/Agent badges |
| `middleware.ts` | Auth gating — matches `auth_user` + `auth_token` cookies |
| `lib/auth-helpers.ts` | `getUsers()`, `saveUsers()`, `setAuthCookies()`, `ensureUserColumn()` |
| `app/api/auth/register/route.ts` | Self-registration — validates `data/invites.json` codes |
| `app/api/auth/config/route.ts` | Public endpoint: `{ registrationEnabled: bool }` |
| `app/login/page.tsx` | Login + create account UI |
| `prisma/schema.prisma` | DB schema: Column → List → Task (all cascade on delete) |
| `server.js` | Custom Next.js server (handles HTTPS + HTTP redirect) |
| `scripts/setup.js` | First-run setup wizard + `add-user` + `remove-user` subcommands |
| `scripts/admin.js` | All other admin CLI commands |
| `scripts/build.sh` | Build wrapper — finds nvm node v20, runs prisma generate + next build |
| `scripts/backup-db.sh` | DB backup script (generated by setup wizard) |
| `data/users.json` | Users + tokens (gitignored) |
| `data/invites.json` | Pending invite codes with expiry (gitignored) |
| `.env.local` | Local env overrides: `INVITE_CODE`, `PORT`, `CERT_DIR` etc (gitignored) |
| `CLAUDE.md` | This file |

---

## Admin CLI — Full Reference

Run `npm run admin` for help. All commands work on whichever machine you run them on.

### Info
| Command | What it does |
|---------|-------------|
| `npm run status` | Service running, users, open/done tasks, DB size, last backup |
| `npm run list-users` | Print all users (first = admin) |
| `npm run context` | Full session dump: git + status + active invites — **use at session start** |

### User management
| Command | What it does |
|---------|-------------|
| `npm run setup` | Full first-run wizard |
| `npm run add-user` | Add a user interactively |
| `npm run remove-user [name]` | Remove user — column renamed to "Shared" (safe default) |
| `npm run remove-user [name] delete` | Remove user + delete column and all tasks |
| `npm run reset-password [name]` | Reset a user's password without removing them |
| `npm run rename-user [old] [new]` | Rename a user and their column |
| `npm run gen-invite [minutes]` | Generate a time-limited, single-use invite code (default 10 min) |

### Database
| Command | What it does |
|---------|-------------|
| `npm run export-data [file]` | Export board to JSON |
| `npm run import-data <file>` | Import board from JSON (replaces all data, asks YES) |
| `npm run purge-completed` | Delete completed tasks — all, or older than N days |

### Service
| Command | What it does |
|---------|-------------|
| `npm run restart` | Restart server (auto-detects launchctl / systemctl) |
| `npm run service:install` | Install as auto-start launchd service (Mac) |
| `npm run service:uninstall` | Remove auto-start service (Mac) |

---

## MCP Tools (use these, not screenshots)

The `2dobetter` MCP server is registered. Use these tools for all task operations:

| Tool | What it does |
|------|-------------|
| `get_board` | Full board — all columns, lists, tasks |
| `get_column` | One column's lists + tasks (`dave` or `claude`) |
| `create_task` | Add a task to a list |
| `complete_task` | Mark a task done |
| `uncomplete_task` | Reinstate a completed task |
| `update_task` | Rename a task |
| `delete_task` | Remove a task |
| `move_task` | Move a task to a different list |
| `create_list` | Create a new list in a column |
| `delete_list` | Delete a list + its tasks |
| `search_tasks` | Find tasks by title |

---

## Column Ownership

- **Dave column** — Dave's tasks. Don't touch unless Dave asks.
- **Claude column** — Claude's workspace. Track in-progress work here.
  - Add a task when starting a significant piece of work
  - Complete it when done
  - Use as a living scratchpad for the session
- **Column sort order** (client-side): own column → unowned/agent → teammates

---

## Session End — Wins Log

At end of session, append the new entry to the gist:
**https://gist.github.com/LucheGames/541caf8b28a471141162fed44ecf4c38**

**Keep entries SHORT and punchy** — these are talking points, not a feature log. Aim for:
- 5–8 bullet points in ACHIEVED (one line each, what it does, not how)
- 2–4 bullets in UNRESOLVED
- 2–3 bullets in NOTES (gotchas, key paths, things future-you needs to know)

If you're writing more than 3 lines per bullet, you're writing too much.

---

## Git Rules

- `~/2DoBetter/` on Mac is the working git repo → remote `LucheGames/ToDoBetter`
- Commit and push freely as part of the normal workflow
- Never force-push to master
- Build output (`.next/`), DB (`prisma/dev.db`), secrets (`data/`, `.env*`, `certs/`) are gitignored
