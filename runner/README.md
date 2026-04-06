# 2Do Better — Task Runner

Trigger Claude Code jobs from anywhere using your 2Do Better board as a task queue.

Add a task to the **Queue** list in your Claude column from your phone. A lightweight daemon running on your Mac picks it up, fires a headless Claude Code session, and posts the result back to the **Results** list — all within 30 seconds.

---

## How it works

```
Mobile / browser
  └─ Add task to Queue list in Claude column
          │
          │  (polling every 30s)
          ▼
  Mac daemon (runner/daemon.js)
  ├─ Moves task to Active (spinner appears on board)
  ├─ Runs: claude -p "<task>" --model sonnet
  └─ Posts result to Results list
          │
          ▼
  Results list shows: ✓ [abc12345] One-sentence summary
  └─ Copy the 8-char session ID to --resume interactively
```

The daemon lives on the same machine as Claude Code. The 2Do Better server is just the message bus — it can be on a different machine entirely.

---

## Setup

**Prerequisites:** Claude Code CLI installed, 2Do Better MCP server configured in Claude Code.

**1. Pull the latest code and start the daemon:**

```bash
cd /path/to/ToDoBetter
git pull
CLAUDECODE= node runner/daemon.js
```

That's it. The daemon reads the API URL and auth token automatically from your existing MCP config in `~/.claude.json`.

**2. Verify it's working:**

Add a task to the Queue list in your Claude column:
```
list the files in the current directory and tell me what the project does
```

Within 30 seconds it should move to Active, then a result appears in Results.

---

## Task syntax

| What you type in Queue | What fires |
|---|---|
| `summarize the deploy logs` | Fresh session in default repo |
| `--continue check the auth fix` | Continue the most recent CLI session |
| `--resume and add 3` | Resume last session (ID auto-filled) |
| `--resume abc12345 continue the auth fix` | Resume a specific session by ID |
| `~/Repos/Lazear: run the eval suite` | Fresh session in a different repo |
| `--resume abc12345 ~/Repos/Foo: fix bug` | Resume + different repo |

---

## Results

Completed tasks appear in Results with a session ID and one-sentence summary:
```
✓ [abc12345] Christmas 2026 falls on a Friday.
```

Copy `abc12345` and use it to resume the session remotely:
```
--resume abc12345 now check if there are any holidays that week
```

Or just `--resume your follow-up here` — the daemon fills in the last session ID automatically.

Resume interactively on the Mac:
```bash
claude --resume abc12345
```

> **Note:** `--resume` only works for sessions the daemon has run since startup. The daemon stores a short-ID → full-UUID map in `~/.claude-runner-sessions.json`. If the map is empty (fresh daemon, first run), `--resume` gracefully falls back to `--continue`.

Results tasks older than 24 hours are automatically completed (sent to graveyard) each poll cycle to keep the list clean.

---

## Usage cap handling

Claude Code limits reset every 5 hours. If a task hits a usage cap:
- It's returned to Queue and retried at :01 past the next hour
- After 5 failures (covering the weekly window), it's posted to Results as `[weekly-cap]` and marked complete

---

## Optional config

By default no config file is needed. To override any setting, create `~/.claude-runner.json`:

```json
{
  "defaultRepo": "/Users/you/_Repos/ToDoBetter",
  "model": "sonnet",
  "pollMs": 30000,
  "columnSlug": "claude"
}
```

See `runner/config-example.json` for all available fields.

| Field | Default | Description |
|---|---|---|
| `apiBase` | from MCP config | 2Do Better server URL |
| `agentToken` | from MCP config | Auth token |
| `defaultRepo` | repo containing daemon.js | Where `claude` runs |
| `model` | `"sonnet"` | `sonnet`, `haiku`, or full model ID |
| `pollMs` | `30000` | Poll interval in milliseconds |
| `columnSlug` | `"claude"` | Column to watch for Queue list |

---

## Running as a background service (Mac)

To keep the daemon alive across reboots, install it as a launchd service.

**1. Find your node binary** (needs nvm node, not system node):
```bash
which node   # run this after loading nvm
```

**2. Create `~/Library/LaunchAgents/com.2dobetter.runner.plist`:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.2dobetter.runner</string>
  <key>ProgramArguments</key><array>
    <string>/Users/YOU/.nvm/versions/node/v20.X.Y/bin/node</string>
    <string>/Users/YOU/_Repos/ToDoBetter/runner/daemon.js</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>HOME</key><string>/Users/YOU</string>
    <key>PATH</key><string>/Users/YOU/.nvm/versions/node/v20.X.Y/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/claude-runner.log</string>
  <key>StandardErrorPath</key><string>/tmp/claude-runner.err</string>
</dict></plist>
```

**3. Load it:**
```bash
launchctl load ~/Library/LaunchAgents/com.2dobetter.runner.plist
```

**4. Tail the logs:**
```bash
tail -f /tmp/claude-runner.log
```
