# 2Do Better — AI Agents

Multiple AI agents can connect to your board. Each lives in its own folder with a full setup guide.

---

## Available Agents

| Agent | Model | Free tier | RPM | Status | Setup |
|-------|-------|-----------|-----|--------|-------|
| **Claude** (MCP) | Claude 3.5+ | Requires API key | — | ✅ Ready | [agents/claude/](claude/) |
| **Gemini** | Gemini 2.5 Flash | ✅ No card | 5 | ✅ Ready | [agents/gemini/](gemini/) |
| **Groq** | Llama 3.3 70b | ✅ No card | 30 | ✅ Ready | [agents/groq/](groq/) |
| **Ollama** | qwen2.5:7b (local) | ✅ Free forever | None | ✅ Ready | [agents/ollama/](ollama/) |

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

**Use Ollama** if you want 100% local inference with zero rate limits, zero cloud, and zero API keys. Requires Ollama installed on the same machine as your server. Best for a home server or air-gapped environments. See [ollama/README.md](ollama/) for the Linux CPU governor tip that gives a 3–5× speed boost.
