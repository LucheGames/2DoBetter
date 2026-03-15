# 2Do Better — Claude Agent (MCP)

Connects Claude to your 2Do Better board via MCP (Model Context Protocol).
Claude can read and write the board directly — no copy-pasting, no manual updates.

---

## Quick Start

**1. Build the MCP server** (one-time, in the repo root):
```bash
cd mcp && npm install && npm run build
```

**2. Add to `~/.claude.json`:**
```json
{
  "mcpServers": {
    "2dobetter": {
      "command": "node",
      "args": ["/absolute/path/to/2DoBetter/mcp/dist/server.js"],
      "env": {
        "API_BASE_URL": "https://your-board-url:3000",
        "AUTH_TOKEN":   "your-agent-token"
      }
    }
  }
}
```

**3.** Start a Claude Code session — it greets you with a board summary and can read, update, and complete tasks directly.

---

## Getting an Agent Token

1. Open the board in your browser
2. Click **+ Agent** in the header → name it (e.g. `claude`)
3. Copy the token shown — **it is only shown once**
4. Paste it as `AUTH_TOKEN` in `~/.claude.json`

If you lose the token: Admin panel ⚙ → find the agent's column → hold **Rotate token** (1.5s) → copy new token → update `~/.claude.json`.

---

## How It Works

The MCP server is a small Node.js process that Claude Code starts automatically.
It translates MCP tool calls into REST API requests to your 2Do Better server,
authenticated with a permanent Bearer token.

```
Claude Code ←→ MCP server (mcp/dist/server.js) ←→ 2Do Better REST API
```

The MCP server never stores data — it's a stateless proxy. Your board data
stays on your server.

---

## Available Tools

| Category | Tools |
|----------|-------|
| Board | `get_board` · `get_column` |
| Lists | `create_list` · `rename_list` · `move_list` · `archive_list` · `restore_list` · `get_graveyard` |
| Tasks | `create_task` · `update_task` · `delete_task` · `move_task` · `complete_task` · `uncomplete_task` · `search_tasks` |

---

## Usage Pattern

Ask Claude naturally — it picks up the right tools:

```
"Check 2Do and tell me what's pending"
"Mark the deploy task as done"
"Add a task called 'Write tests' to my first list"
"What did the team add to the board today?"
```

---

## Security

- The MCP client connects to the board URL over HTTPS — exactly like a browser
- Never give the agent SSH access to the server
- Never share `data/users.json` or `prisma/dev.db` with the agent
- The agent token gives write access to the board — rotate it from the admin panel if compromised
- Use **Lane Mode** (🔒) to restrict the agent to its own column only

---

## Updating

```bash
cd mcp && npm run build
```

Re-build whenever you pull updates that touch `mcp/server.ts`.
No restart of Claude Code needed — MCP reconnects automatically.

---

## Integration Notes

### Token types — don't confuse them

| Token | Field in `users.json` | Rotates? | Use for |
|-------|----------------------|---------|---------|
| Agent token | `agentToken` (camelCase) | Only when manually rotated | `AUTH_TOKEN` in `~/.claude.json` |
| Session token | `token` | On every logout | Browser auth cookie only |

Use `agentToken` in `~/.claude.json`. The session token (`token`) rotates on every logout — if you accidentally use it as `AUTH_TOKEN`, it breaks the next time anyone logs out. If MCP tools start returning auth errors, this is the first thing to check.

### Rotating a lost token
Admin panel ⚙ → find the Claude column → **hold** Rotate token for 1.5 seconds → copy the new token → update `AUTH_TOKEN` in `~/.claude.json`. The MCP server picks it up on the next tool call (no Claude Code restart needed).

### MCP vs standalone agents
The MCP integration runs inside your Claude Code session — it has access to the full conversation context and can interleave board operations with coding, file editing, and web search in a single session. The standalone agents (Groq, Cerebras, Gemini, Ollama) are separate processes you run in a terminal.

Use MCP when: you want Claude to manage the board as part of a coding session.
Use standalone agents when: you want an autonomous agent running in the background, or you want to test a different model.

### Self-signed certificate note
If your board uses a self-signed TLS certificate, the MCP server (and all standalone agents) set `NODE_TLS_REJECT_UNAUTHORIZED=0` to allow the connection. This is safe for a private home server — don't replicate this pattern against untrusted servers.
