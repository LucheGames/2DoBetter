# 2Do Better — AI Agents

Multiple AI agents can connect to your board. Each lives in its own folder with a full setup guide.

---

## Available Agents

| Agent | Model | Free tier | Speed | Status | Setup |
|-------|-------|-----------|-------|--------|-------|
| **Claude** (MCP) | Claude 3.5+ | Requires API key | Fast | ✅ Ready | [agents/claude/](claude/) |
| **Cerebras** | Qwen 3 235B MoE | ✅ No card | 🚀 Fast | ✅ Ready | [agents/cerebras/](cerebras/) |
| **Groq** | Llama 4 Scout 17b | ✅ No card | 🚀 ~400 tok/s | ✅ Ready | [agents/groq/](groq/) |
| **Gemini** | Gemini 2.5 Flash | ✅ No card | Fast | ✅ Ready | [agents/gemini/](gemini/) |
| **Ollama** | qwen2.5:14b (local) | ✅ Free forever | ~30 tok/s CPU | ✅ Ready | [agents/ollama/](ollama/) |

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

**Use Cerebras** for the fastest free-tier experience — Qwen 3 235B MoE (frontier-class model on custom silicon). Blazing fast, excellent multi-step tool use, chains multiple board tasks in one shot. Best overall free choice.

**Use Groq** as a solid free alternative (30 RPM, Llama 4 Scout). Good for interactive sessions; slightly slower than Cerebras.

**Use Ollama** if you want 100% local inference with zero rate limits, zero cloud, and zero API keys. Requires Ollama installed on the same machine as your server. Best for a home server or air-gapped environments. See [ollama/README.md](ollama/) for the Linux CPU governor tip that gives a 3–5× speed boost.

---

## Integration Notes

Each agent README has a dedicated **Integration Notes** section — API quirks, model selection gotchas, and lessons learned from building and testing each agent against a live board.

| Agent | Key learnings |
|-------|--------------|
| [Claude MCP](claude/README.md#integration-notes) | Token types (`agentToken` vs session token), MCP vs standalone, TLS note |
| [Cerebras](cerebras/README.md#integration-notes) | Model naming gotcha (free-tier models), confirmed multi-task chaining, rate limit auto-recovery |
| [Groq](groq/README.md#integration-notes) | Full vendor-path model IDs, multi-task chaining, OpenAI-compat swap |
| [Gemini](gemini/README.md#integration-notes) | Google AI SDK differences, board pre-fetch strategy, bogus retry-after values, API key setup maze |
| [Ollama](ollama/README.md#integration-notes) | Context window gotcha, CPU governor, theatrical narration bug, language drift, XML leakage |
