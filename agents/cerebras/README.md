# 2Do Better — Cerebras Agent

Llama 3.3 70b at ~2000 tokens/second — free tier, cloud-hosted.

Cerebras runs LLMs on custom wafer-scale silicon that delivers 10–20× faster inference than GPU cloud providers. The 70b parameter model responds almost as fast as a 7b running locally.

---

## Why Cerebras

| | Cerebras | Groq | Gemini | Ollama |
|---|---|---|---|---|
| Cost | **Free tier** | Free tier | Free tier | Free forever |
| Speed | **~2000 tok/s** | ~400 tok/s | ~150 tok/s | ~30 tok/s (CPU) |
| Model quality | **70b** | 17b Scout | Gemini Flash | 14b (local) |
| Privacy | Cloud | Cloud | Cloud | **100% local** |

Great for: fast autonomous multi-step board tasks where you want 70b quality without waiting.

---

## Quick Start

**1. Get a free API key:**
- Sign up at [cloud.cerebras.ai](https://cloud.cerebras.ai)
- Create an API key from the dashboard

**2. Get an agent token** from your board:
- Open the board → click **+ Agent** → name it (e.g. `Cerebras`)
- Copy the token shown — **it is only shown once**

**3. Install and configure:**
```bash
cd agents/cerebras
npm install
cp .env.example .env
nano .env    # fill in CEREBRAS_API_KEY, API_BASE_URL, AGENT_TOKEN
```

**4. Run:**
```bash
npm run chat          # interactive session
npm start "Check my column and do the first three tasks"
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CEREBRAS_API_KEY` | ✅ | From [cloud.cerebras.ai](https://cloud.cerebras.ai) |
| `API_BASE_URL` | ✅ | Your 2Do Better server, e.g. `https://localhost:3000` |
| `AGENT_TOKEN` | ✅ | From the board **+ Agent** button |
| `CEREBRAS_MODEL` | optional | Model to use. Default: `qwen-3-235b-a22b-instruct-2507`. Fallback: `llama3.1-8b` |
| `AGENT_NAME` | optional | Must match column owner username (default: `Cerebras`) |
| `DEBUG` | optional | Set to `1` to log every tool call with arguments |

> **Check current model names** at [cloud.cerebras.ai/platform](https://cloud.cerebras.ai/platform) — Cerebras updates their available models periodically.

---

## CLI Feedback

```
⠸ Thinking... 1s
  🔧 get_board
⠦ Thinking... 0s
  🔧 create_list
⠋ Thinking... 0s
  🔧 create_task + create_task + create_task + reorder_tasks

Cerebras: Created "Sprint 1" with 3 tasks. Moved "Write the tests" to the top.
```

At 2000 tok/s the spinner barely has time to show a second tick.

---

## Agent Token

The `AGENT_TOKEN` is a permanent bearer token — not the same as an invite code.

- Created when you click **+ Agent** in the board header
- Shown **once** at creation — copy it immediately
- If lost: Admin panel ⚙ → find the agent column → hold **Rotate token** (1.5s) → copy new token → update `.env`

---

## Integration Notes

### Model naming — the free-tier gotcha
Cerebras updates model names frequently. The most common confusion:

| Model string | Status |
|---|---|
| `llama3.3-70b` | ❌ Does not exist (missing hyphen after `llama`) |
| `llama-3.3-70b` | ❌ Not available on free tier |
| `qwen-3-235b-a22b-instruct-2507` | ✅ Free tier preview — use this |
| `llama3.1-8b` | ✅ Free tier production — lightweight fallback |

If you get a `404 (no body)` error, the model name is wrong. Always verify at [cloud.cerebras.ai/platform](https://cloud.cerebras.ai/platform).

### Qwen 3 235B MoE — confirmed capabilities
Tested against a live board (March 2026):
- **Multi-task chaining**: executes 3+ board tasks in a single shot without stopping to report
- **Abstract reasoning**: task categorisation, project planning, risk analysis — near-instant
- **Tool use**: parallel tool calls, correct argument types, no hallucinated task IDs
- Context: 65k tokens — the full board JSON fits easily; no truncation issues

The 8b fallback works for simple single-step operations but is unreliable for multi-step chaining.

### Rate limit recovery
The agent uses `callWithRetry` — on a 429 response it reads the `retry-after` header, waits the specified seconds, then resumes automatically. During testing the agent was mid-task when it hit a rate limit, waited ~60 seconds, and continued without any user input.

The `💡 type 'continue'` hint only appears when all retries are exhausted — a rare edge case in `--chat` mode. Session history is preserved in the `messages` array, so typing `continue` resumes the task from where it cut off.

### OpenAI-compatible API
Any code that works with the `openai` npm package works with Cerebras — just set `baseURL`:

```js
const cerebras = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY,
  baseURL: "https://api.cerebras.ai/v1",
});
```

No SDK changes, no different tool format — it's a drop-in swap from Groq.
