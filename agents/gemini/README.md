# 2Do Better — Gemini Agent

Connects Google Gemini to your 2Do Better board via the REST API.
Supports single-shot commands and a persistent chat session.

---

## Quick Start

```bash
cd agents/gemini
npm install
cp .env.example .env
nano .env          # fill in your three values
npm run chat       # interactive session
```

Single-shot:
```bash
npm start "Summarise my column"
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ | From https://aistudio.google.com/app/apikey |
| `API_BASE_URL` | ✅ | Your 2Do Better server, e.g. `https://localhost:3000` |
| `AGENT_TOKEN` | ✅ | From the board: **+ Agent** button → copy the one-time token |
| `AGENT_NAME` | optional | Name shown in prompts (default: `Gemini`) |
| `DEBUG` | optional | Set to `1` to log every tool call to stderr |

---

## Getting a Gemini API Key (Free Tier)

1. Go to https://aistudio.google.com/app/apikey
2. Sign in with a Google account
3. Click **Create API key → Create API key in new project**
   (let AI Studio create the project — avoids Cloud Console)
4. Copy the key into `.env`

**Do not create the key through Google Cloud Console directly** — the
Generative Language API must be enabled on the linked project first,
and AI Studio handles that automatically.

---

## Google Free Tier — Honest Assessment

As of early 2026, the free tier for Gemini 2.5 Flash is:

| Limit | Value |
|-------|-------|
| Requests per minute (RPM) | **5** |
| Tokens per day | 250,000 |
| Cost | Free (no credit card required) |

### What this means in practice

Each user message costs a minimum of **1 Gemini API call** (read-only)
or **2 calls** (any write operation). At 5 RPM you can have a slow but
functional chat session — expect 12–15 seconds between exchanges.

### Common pitfalls

**`limit: 0` on all models**
The API key is linked to a project where the Generative Language API
is not enabled. Fix: go to AI Studio → Create API key → Create in new
project. Don't try to fix this through Cloud Console — it's a maze.

**"Model not found or not supported"**
The model name changed or isn't available on your account tier. Use
`gemini-2.5-flash` — it's the only model with a non-zero free quota
as of March 2026. Avoid `gemini-2.0-flash` (quota: 0 on free tier)
and `gemini-1.5-flash` (deprecated).

**Rate limit wait showing millions of seconds**
A bug in Google's error response embeds quota IDs that look like retry
delays. The agent caps all waits at 90 seconds — if you see a long
wait, it's capped, not actually counting down to the heat death of the
universe.

**OAuth consent screen warning in Cloud Console**
Irrelevant — that's for apps that log users in with Google. API key
auth doesn't need it. Ignore it.

**Non-US accounts**
Free tier works in all regions. Regional restrictions are not the cause
of `limit: 0` errors — the API project setup is.

### Should you add billing?

You don't need to. The free tier works without a credit card if the
API is enabled correctly. Adding billing unlocks higher rate limits
(Tier 1: 1000 RPM) but isn't required for personal use.

---

## What the Agent Can Do

The agent has been tested against the full board feature set:

- **Read & summarise** — fetch your column, list open tasks, answer questions about the board
- **Create & organise** — create tasks and lists, move tasks between lists, reorder, rename
- **Act on tasks as prompts** — if a task title is a question or instruction ("What are the risks?", "Rename this list"), the agent reads it, does the work, then flags it done. It will not silently tick boxes without reasoning.
- **Respect permissions** — locked columns are left untouched; the agent won't touch other users' columns unless told to
- **Graveyard** — archive lists (reversible), restore from graveyard, understand the difference from permanent deletion

---

## Rate Limit Strategy

The agent uses three techniques to stay within the free tier:

1. **Board pre-fetch** — the board state is fetched from your server
   (free, instant) and injected into each message. Gemini gets current
   data without a tool call, halving API usage for read queries.

2. **Parallel tool calls** — when multiple independent operations are
   needed (move 3 tasks, archive 2 lists), they are issued in one
   batch rather than sequentially, reducing the number of Gemini API
   round-trips.

3. **Retry with backoff** — rate limit errors automatically wait and
   retry (up to 3 times, capped at 90s per wait).

---

## Agent Token

The `AGENT_TOKEN` is a permanent bearer token tied to the agent's
column on the board. It is **not** the same as an invite code.

- Created when you click **+ Agent** in the board header
- Shown **once** at creation — copy it immediately
- If lost: Admin panel ⚙ → find the agent column → hold **Rotate token** (1.5s) → copy new token

---

## Groq Alternative

If Google's rate limits are too restrictive, see `../groq/` for a
drop-in alternative using Llama 4 via Groq — free tier, no credit
card, 30 RPM.
