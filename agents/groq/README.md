# 2Do Better — Groq Agent

Connects Groq-hosted models (Llama 4, Mixtral, etc.) to your 2Do Better board.
Same tools as the Gemini agent — drop-in alternative with a much more generous free tier.

---

## Why Groq

| | Groq (free) | Gemini (free) |
|---|---|---|
| Requests per minute | **30 RPM** | 5 RPM |
| Credit card required | ❌ No | ❌ No |
| Sign-up friction | Low | High (Cloud Console maze) |
| Model | Llama 4 Scout / Mixtral | Gemini 2.5 Flash |

---

## Quick Start

**1. Get a Groq API key** (free, no card):
- Go to https://console.groq.com
- Sign up → **API Keys** → **Create API key** → copy it

**2. Get an agent token** from your board:
- Open the board → click **+ Agent** → name it (e.g. `groq`)
- Copy the token shown — **it is only shown once**

**3. Install and configure:**
```bash
cd agents/groq
npm install
cp .env.example .env
nano .env    # fill in your three values
```

**4. Run:**
```bash
npm run chat          # interactive session
npm start "Check my column and summarise what needs doing"
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | ✅ | From https://console.groq.com/keys |
| `API_BASE_URL` | ✅ | Your 2Do Better server, e.g. `https://localhost:3000` |
| `AGENT_TOKEN` | ✅ | From the board **+ Agent** button |
| `AGENT_NAME` | optional | Name shown in prompts (default: `Groq`) |
| `GROQ_MODEL` | optional | Override model (default: `meta-llama/llama-4-scout-17b-16e-instruct`) |
| `DEBUG` | optional | Set to `1` to log every tool call |

---

## Models

Groq's free tier supports several models. Set `GROQ_MODEL` in `.env` to switch:

| Model ID | Best for |
|----------|----------|
| `meta-llama/llama-4-scout-17b-16e-instruct` | Default — fast, good tool use, responsive chat |
| `meta-llama/llama-4-maverick-17b-128e-instruct` | Larger context, slower |
| `llama-3.3-70b-versatile` | Deeper reasoning — use this for analysis, risk assessment, planning tasks |
| `mixtral-8x7b-32768` | Long context, good for large boards |

Check https://console.groq.com/docs/models for current availability.

**Tip:** Scout is the best default for task management and board operations. Switch to `llama-3.3-70b-versatile` when you want the agent to produce richer thinking — risk analysis, project planning, summarisation.

---

## What the Agent Can Do

The agent has been tested against the full board feature set:

- **Read & summarise** — fetch your column, list open tasks, answer questions about the board
- **Create & organise** — create tasks and lists, move tasks between lists, reorder, rename
- **Act on tasks as prompts** — if a task title is a question or instruction ("What are the risks?", "Rename this list"), the agent reads it, does the work, then flags it done. It will not silently tick boxes without reasoning.
- **Respect permissions** — locked columns are left untouched; the agent won't touch other users' columns unless told to
- **Graveyard** — archive lists (reversible), restore from graveyard, understand the difference from permanent deletion

---

## Rate Limits

Groq's free tier is **30 RPM** (requests per minute). For most board tasks this is plenty — the agent batches independent operations into parallel calls where possible, reducing round-trips.

If you hit a limit, the agent waits automatically and tells you when it will retry (e.g. `retrying around 14:32:05`). If all retries are exhausted it tells you the exact clock time to try again.

---

## Agent Token

The `AGENT_TOKEN` is a permanent bearer token — not the same as an invite code.

- Created when you click **+ Agent** in the board header
- Shown **once** at creation — copy it immediately
- If lost: Admin panel ⚙ → find the agent column → hold **Rotate token** (1.5s) → copy new token → update `.env`
