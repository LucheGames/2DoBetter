# 2 Do Better — Claude Instructions

## Session Start Checklist

At the start of every session, do this automatically (no need to ask):

1. **Check the service is running:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 2
   ```
   If not `200`, start it:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.luchegames.2dobetter.plist 2>/dev/null || true
   ```
   Wait a few seconds, verify it came up.

2. **Check the board** using the `get_board` MCP tool.
   Review what's in Dave's column and the Claude column. Note anything in-progress or blocked.

3. **Greet Dave with a 1-line board status** — e.g. "Board: 3 tasks in Dave's queue, 1 in mine (MCP server refactor, in progress)."

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
- **Claude column** — Claude's workspace. Track your own in-progress work here.
  - Add a task when starting a significant piece of work
  - Complete it when done
  - Use it as a living scratchpad for what you're doing this session

---

## Project Setup

- **App:** `~/2DoBetter/` (stable install, production build)
- **Dev source:** `_Repos/github/_staging/2-Do-Better/` (GitHub canonical)
- **Dev server:** `npm run dev -- --webpack` (no Turbopack — it crashes on this machine)
- **Node:** `/Users/macbeast/.nvm/versions/node/v20.20.0/bin/node`
- **DB:** `prisma/dev.db` (SQLite, local only)
- **Service:** launchd — auto-starts on login, KeepAlive
- **Logs:** `~/Library/Logs/2dobetter.log`

## Git Rules

- GitHub is source of truth: `_Repos/github/_staging/2-Do-Better/` → remote `LucheGames/ToDoBetter`
- Never push without Dave's explicit permission
- Branch for features, commit straight to master for small fixes
- See `.git-workflow.md` for full conventions
