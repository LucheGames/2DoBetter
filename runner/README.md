# 2Do Better — Task Runner

An optional background daemon that watches an agent's **Queue** list and fires headless Claude Code sessions automatically. Add a task from your phone, get a result posted back within 30 seconds.

The runner is **agent-agnostic** — any column with a Queue list can have one. Claude Code is the only supported agent today; other agents will be documented as they're tested.

---

## How it works

```
Any device (phone, browser, another agent)
  └─ Add task to Queue list in agent's column
          │
          │  (polling every 30s)
          ▼
  Runner daemon (runner/daemon.js)
  ├─ Moves task → Active
  ├─ Fires: claude -p "<task>" --model sonnet
  └─ Posts result → Results list
          │
          ▼
  ✓ [abc12345] One-sentence summary of what Claude did
```

The daemon lives on the same machine as Claude Code. The 2Do Better server is just the message bus — it can be a different machine.

---

## Prerequisites

- Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- Logged in to Claude Code (`claude login`)
- 2Do Better server running and reachable
- An agent user created in 2Do Better with an agent token (admin panel → agent column → Generate agent token)

---

## Install

```bash
npm run runner:install <columnSlug> <agentToken> <apiBase>
```

**Example (on the same machine as the 2Do Better server):**
```bash
npm run runner:install claude abc123token https://yourserver.duckdns.org:3000
```

This:
- Writes `~/.claude-runner.json` with your config
- Installs and starts a background service (systemd on Linux, launchd on Mac)
- Enables auto-start on boot/login

**Verify it's running:**
```bash
# Linux
journalctl --user -u claude-runner -f

# Mac
tail -f ~/Library/Logs/claude-runner.log
```

## Uninstall

```bash
npm run runner:uninstall
```

---

## Task syntax

| What you type in Queue | What fires |
|---|---|
| `summarise the deploy logs` | Fresh session in default repo |
| `--continue check the auth fix` | Continue the most recent CLI session |
| `--resume and add 3` | Resume last session (ID auto-filled) |
| `--resume abc12345 continue the auth fix` | Resume a specific session by ID |
| `~/Repos/Lazear: run the eval suite` | Fresh session in a different repo |
| `--resume abc12345 ~/Repos/Foo: fix bug` | Resume + different repo |

---

## Results

Completed tasks appear in the Results list:
```
✓ [abc12345] Christmas 2026 falls on a Friday.
```

Use the 8-char session ID to resume interactively:
```bash
claude --resume abc12345
```

Or queue a follow-up — the daemon fills in the last session ID automatically:
```
--resume now check if there are any holidays that week
```

Results tasks older than 24 hours are automatically completed to keep the list clean.

---

## Usage cap handling

If a task hits a Claude Code usage cap:
- Returned to Queue, retried at :01 past the next hour
- After 5 failures, posted to Results as `[weekly-cap]` and closed

---

## Config reference

Config is written to `~/.claude-runner.json` by `runner:install`. Edit it directly to change any setting — restart the service after.

| Field | Default | Description |
|---|---|---|
| `apiBase` | required | 2Do Better server URL |
| `agentToken` | required | Agent token from admin panel |
| `defaultRepo` | runner's parent directory | Working directory for Claude sessions |
| `columnSlug` | `"claude"` | Column slug to watch |
| `model` | `"sonnet"` | Claude model to use |
| `pollMs` | `30000` | Poll interval in milliseconds |

---

## Agent compatibility

| Agent | Status | Notes |
|---|---|---|
| Claude Code | ✅ Tested | Linux (systemd) + Mac (launchd) |
| Others | 🔲 Untested | PRs welcome |
