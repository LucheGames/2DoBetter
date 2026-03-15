# 2Do Better — Ollama Agent

Runs entirely on your own hardware — no API key, no rate limits, no cloud.
Connects a local Ollama model to your 2Do Better board.

---

## Why Ollama

| | Ollama (local) | Groq (free) | Gemini (free) |
|---|---|---|---|
| Cost | **Free forever** | Free (30 RPM) | Free (5 RPM) |
| Rate limits | **None** | 30 RPM | 5 RPM |
| Privacy | **100% local** | Cloud | Cloud |
| Internet required | **No** | Yes | Yes |
| GPU needed | No (CPU works) | N/A | N/A |
| Speed on CPU-only | ~8 tok/s (7b) | Fast | Fast |

Great for a home server, air-gapped environments, or if you just don't want to sign up for anything.

---

## Requirements

- **Ollama installed** on the same machine as your 2Do Better server
- **Node 18+** on that machine
- ~5GB disk space for the default model

---

## Quick Start

**1. Install Ollama** (if not already):
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**2. Pull the model and create a 32k context variant:**
```bash
ollama pull qwen2.5:7b

# The board context JSON exceeds qwen's default 4096-token limit.
# Create a variant with a larger context window:
printf "FROM qwen2.5:7b\nPARAMETER num_ctx 32768\n" | ollama create qwen2.5-32k -f -
```

**3. Get an agent token** from your board:
- Open the board → click **+ Agent** → name it (e.g. `ollama`)
- Copy the token shown — **it is only shown once**

**4. Install and configure:**
```bash
cd agents/ollama
npm install
cp .env.example .env
nano .env    # fill in API_BASE_URL and AGENT_TOKEN
```

**5. Run:**
```bash
npm run chat          # interactive session
npm start "Check my column and summarise what needs doing"
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `API_BASE_URL` | ✅ | Your 2Do Better server, e.g. `https://localhost:3000` |
| `AGENT_TOKEN` | ✅ | From the board **+ Agent** button |
| `OLLAMA_HOST` | optional | Ollama server address (default: `http://localhost:11434`) |
| `OLLAMA_MODEL` | optional | Override model (default: `qwen2.5-32k`) |
| `AGENT_NAME` | optional | Name shown in prompts (default: `Ollama`) |
| `DEBUG` | optional | Set to `1` to log every tool call |

---

## Models

Ollama supports many models. Set `OLLAMA_MODEL` in `.env` to switch.
Pull a model first with `ollama pull <model>`.

| Model | Size | Context | Best for |
|-------|------|---------|----------|
| `qwen2.5-32k` | ~4.7GB + 1.8GB KV | 32768 | **Default** — the 32k variant you create in setup. Works with full board contexts |
| `qwen2.5:7b` | ~4.7GB | 4096 | Bare model — too small for full board context without the variant above |
| `qwen2.5:14b` | ~9GB | 4096 | Larger weights; also needs a 32k variant: `printf "FROM qwen2.5:14b\nPARAMETER num_ctx 32768\n" \| ollama create qwen2.5-14b-32k -f -` |
| `llama3.2:3b` | ~2GB | 4096 | Very fast on limited hardware, simpler tasks only |

**Why the 32k variant?** The board sends its full JSON state to the model at the start of each request (~7000–8000 tokens). The default `qwen2.5:7b` context window is only 4096 — it truncates the prompt and returns 500 errors. The `qwen2.5-32k` variant uses the same weights but reserves 32768 tokens of KV cache (~1.8GB extra RAM).

**Tip:** On CPU-only hardware `qwen2.5-32k` uses ~7GB total RAM and runs at ~8 tok/s.
If you have a GPU, any of these will run much faster. Check `ollama list` to see what's already pulled.

---

## Hardware Notes

Ollama runs on CPU if no GPU is detected (warning shown on install).

| Hardware | Expected speed (7b model) | Time per response |
|----------|--------------------------|-------------------|
| CPU-only (modern desktop) | ~8–15 tok/s | ~1–3 min |
| CPU-only (laptop) | ~4–8 tok/s | ~2–5 min |
| NVIDIA GPU (8GB VRAM) | ~40–80 tok/s | ~5–15 sec |
| Apple Silicon | ~30–60 tok/s | ~5–15 sec |

**CPU users:** Responses take 1–3 minutes with a modern CPU at 32k context. This is working normally — qwen is prefilling the full board context on every request. Subsequent turns in `--chat` mode are faster once the KV cache is warm.

---

## What the Agent Can Do

- **Read & summarise** — fetch your column, list open tasks, answer questions
- **Create & organise** — create tasks and lists, move tasks between lists, rename
- **Act on tasks as prompts** — reads task titles as instructions, does the work, marks done
- **Respect permissions** — locked columns are left untouched; stays in own column by default
- **Graveyard** — archive lists (reversible), restore from graveyard

---

## Troubleshooting

**`Cannot connect to Ollama`** — Ollama service isn't running. Start it:
```bash
ollama serve
# or if installed as a service:
systemctl --user start ollama
```

**`Model not found`** — Pull it first:
```bash
ollama pull qwen2.5:7b
```

**Slow responses** — Normal on CPU-only. For complex multi-step tasks, expect 30–60 seconds.
Use `DEBUG=1` to watch tool calls in real time.

**Tool calls failing** — Some smaller models struggle with structured tool use.
Stick with `qwen2.5:7b` or larger; avoid 3b models for complex board operations.

---

## Agent Token

The `AGENT_TOKEN` is a permanent bearer token — not the same as an invite code.

- Created when you click **+ Agent** in the board header
- Shown **once** at creation — copy it immediately
- If lost: Admin panel ⚙ → find the agent column → hold **Rotate token** (1.5s) → copy new token → update `.env`
