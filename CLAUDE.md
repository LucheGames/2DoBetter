# 2 Do Better — Developer Guide

---
## ⚠️  PRIVACY RULE — PUBLIC-FACING CONTENT ⚠️

**Never include biographical details in any committed file (README, docs, comments, examples):**
- No real names (use "the user", "the admin", "a teammate")
- No locations, countries, or regions
- No personal details that could de-anonymise the owner
- This repo is public — treat all committed content as readable by anyone

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

**If you accidentally commit a secret:** Immediately rotate/revoke the credential — assume it is compromised. Then scrub with `git filter-repo --replace-text`.

---

## Architecture

### Roles

| Role | Description |
|------|-------------|
| **Server** | The machine running the app — hosts the SQLite DB, serves the Next.js app over HTTPS |
| **Human client** | Any browser (desktop, Android, iOS) connecting to the server |
| **AI agent client** | An MCP server process that calls the app's REST API (same as a browser) |
| **Admin** | SSH access to the server for CLI commands and deploys |

### What lives where

- **DB**: Server only — `prisma/dev.db` (SQLite, gitignored).
- **App server**: Server only — runs via `npm run restart` or systemd/launchd service.
- **MCP client**: Dev machine — compiled from `mcp/server.ts`, run by Claude Code as a stdio process. Calls the REST API like a browser would.
- **Git repo**: Dev machine → GitHub → Server (pull to deploy).

---

## Node Version — Critical Gotcha

| Context | Node version | Notes |
|---------|-------------|-------|
| System (`/usr/bin/node`) | **v10** | Old, installed by package manager |
| nvm (`~/.nvm/versions/node/v20…`) | **v20** | What Next.js needs |
| CLI scripts (`setup.js`, `admin.js`) | Runs on system node v10 | **No optional chaining `?.`, no `??`** |
| `npm run restart` | Builds + restarts | `scripts/build.sh` + service or detached process |

**SSH commands need `bash -i -c '…'` to load nvm:**
```bash
ssh <user>@<server-ip> "bash -i -c 'cd ~/2DoBetter && npm run restart'"
# plain `ssh … "npm run restart"` fails — npm not in PATH in non-interactive shells
```

---

## Deploy Workflow

```bash
# 1. On dev machine — commit and push
git add <files> && git commit -m "message" && git push

# 2. On server — pull and restart (build is automatic)
ssh <user>@<server-ip> "bash -i -c 'cd ~/2DoBetter && git pull && npm run restart'"
```

Server service management:
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
- **Invite codes:** `INVITE_CODE=enabled` in `.env.local` turns on the registration page. Actual codes are time-limited, single-use, stored in `data/invites.json`. Generate with `npm run gen-invite` or from the admin panel.

---

## Key Files

| File | Purpose |
|------|---------|
| `app/page.tsx` | Main board UI, column sorting (own → agent → teammates) |
| `app/components/ColumnPanel.tsx` | Column + task rendering, YOU/TEAMMATE/Agent badges |
| `proxy.ts` | Auth gating — matches `auth_user` + `auth_token` cookies (Next.js 16: renamed from middleware.ts) |
| `lib/auth-helpers.ts` | `getUsers()`, `saveUsers()`, `setAuthCookies()`, `ensureUserColumn()` |
| `app/api/auth/register/route.ts` | Self-registration — validates `data/invites.json` codes |
| `app/api/auth/config/route.ts` | Public endpoint: `{ registrationEnabled: bool }` |
| `app/login/page.tsx` | Login + setup code entry UI |
| `app/join/page.tsx` | New account setup page (username + password) |
| `prisma/schema.prisma` | DB schema: Column → List → Task (all cascade on delete) |
| `server.js` | Custom Next.js server (handles HTTPS + HTTP redirect + onboarding page) |
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
| `npm run context` | Full session dump: git + status + active invites |

### In-app Admin Panel (preferred for user management)

The ⚙ gear icon (top-right, admin only) opens the admin panel. Use it for:
- View users, toggle Human/Agent, set Full/Own column/Read only access
- Generate invite codes (with access flags + expiry baked in)
- Reset a user's password (2s hold)
- Generate/rotate agent tokens (1.5s hold)
- Purge completed tasks or graveyard entries (2s hold, with time filter)

### User management CLI (fallback / scripting)
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

## MCP Tools

The `2dobetter` MCP server is available for AI agent integration. Use these tools for task operations:

| Tool | What it does |
|------|-------------|
| `get_board` | Full board — all columns, lists, tasks |
| `get_column` | One column's lists + tasks by slug |
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

- Each user gets their own column, created automatically on first login.
- Users flagged as `isAgent` get an "Agent" badge; others show "YOU" (own) or "TEAMMATE".
- **Column sort order** (client-side): own column → unowned/agent → teammates.
- Columns without an `ownerUsername` are shared and visible to all users.

---

## Git Rules

- Commit and push freely as part of the normal workflow
- Never force-push to master
- Build output (`.next/`), DB (`prisma/dev.db`), secrets (`data/`, `.env*`, `certs/`) are gitignored
