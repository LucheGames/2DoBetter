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

**2. Pull the default model:**
```bash
ollama pull qwen2.5:7b
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
| `OLLAMA_MODEL` | optional | Override model (default: `qwen2.5:7b`) |
| `AGENT_NAME` | optional | Name shown in prompts (default: `Ollama`) |
| `DEBUG` | optional | Set to `1` to log every tool call |

---

## Models

Ollama supports many models. Set `OLLAMA_MODEL` in `.env` to switch.
Pull a model first with `ollama pull <model>`.

| Model | Size | Best for |
|-------|------|----------|
| `qwen2.5:7b` | ~4.7GB | **Default** — best CPU tool-use, fast, reliable function calling |
| `qwen2.5:14b` | ~9GB | More reasoning depth if you have RAM to spare |
| `llama3.2:3b` | ~2GB | Very fast on limited hardware, simpler tasks only |
| `mistral:7b` | ~4.1GB | Alternative 7b option |

**Tip:** On CPU-only hardware `qwen2.5:7b` is the sweet spot — good tool-use accuracy at ~8 tok/s.
If you have a GPU, any of these will run much faster. Check `ollama list` to see what's already pulled.

---

## Hardware Notes

Ollama runs on CPU if no GPU is detected (warning shown on install).

| Hardware | Expected speed (7b model) |
|----------|--------------------------|
| CPU-only (modern desktop) | ~8–15 tok/s |
| CPU-only (laptop) | ~4–8 tok/s |
| NVIDIA GPU (8GB VRAM) | ~40–80 tok/s |
| Apple Silicon | ~30–60 tok/s |

For board task management, ~8 tok/s is perfectly usable — most operations finish in 10–20 seconds.

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
