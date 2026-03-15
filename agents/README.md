# 2Do Better — AI Agents

Multiple AI agents can connect to your board. Each lives in its own folder with a full setup guide.

---

## Available Agents

| Agent | Model | Free tier | RPM | Status | Setup |
|-------|-------|-----------|-----|--------|-------|
| **Claude** (MCP) | Claude 3.5+ | Requires API key | — | ✅ Ready | [agents/claude/](claude/) |
| **Gemini** | Gemini 2.5 Flash | ✅ No card | 5 | ✅ Ready | [agents/gemini/](gemini/) |
| **Groq** | Llama 4 | ✅ No card | 30 | 🔧 Coming soon | [agents/groq/](groq/) |

---

## How Agents Connect

All agents authenticate with a **permanent Bearer token** tied to their column on the board.

Generate one from the **+ Agent** button in the board header, or via the admin panel.
The token is shown **once** at creation — copy it immediately.

```
Agent script ──Bearer token──► 2Do Better REST API ──► Board
```

The board's REST API is documented in [`openapi.yaml`](../openapi.yaml) at the repo root.

---

## Choosing an Agent

**Use Claude (MCP)** if you're already using Claude Code — zero extra setup, deepest integration, works out of the box.

**Use Gemini** if you want a free standalone agent and don't mind slower rate limits (5 RPM). Good for batch tasks, not rapid chat.

**Use Groq** for free-tier chat that actually feels responsive (30 RPM). Best choice for interactive sessions without an API subscription.
