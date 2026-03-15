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
| Speed on CPU-only | ~20–30 tok/s* | Fast | Fast |

*With `performance` CPU governor set. See [Hardware Notes](#hardware-notes).

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

# Create a variant with a larger context window for --chat mode:
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
| `AGENT_NAME` | optional | Name shown in prompts — **must match the column owner username** (default: `Ollama`) |
| `DEBUG` | optional | Set to `1` to log every tool call with full arguments |

> **AGENT_NAME must match your column owner.** The agent auto-discovers its column slug at startup by matching `ownerUsername` on the board. If the name doesn't match, it won't find its tasks.

---

## Models

Ollama supports many models. Set `OLLAMA_MODEL` in `.env` to switch.
Pull a model first with `ollama pull <model>`.

| Model | Size | Context | Best for |
|-------|------|---------|----------|
| `qwen2.5-32k` | ~4.7GB + 1.8GB KV | 32768 | **Default** — same weights as 7b but 32k context window. Needed for long `--chat` sessions. |
| `qwen2.5:7b` | ~4.7GB | 4096 | Bare model — fine for single-shot commands; context fills up in `--chat` mode |
| `qwen2.5:14b` | ~9GB | 4096 | Larger weights; create a 32k variant: `printf "FROM qwen2.5:14b\nPARAMETER num_ctx 32768\n" \| ollama create qwen2.5-14b-32k -f -` |
| `llama3.2:3b` | ~2GB | 4096 | Very fast on limited hardware, simpler tasks only |

**Why the 32k variant?** Single-shot requests (`npm start "..."`) use modest context (~2–3k tokens). But in `--chat` mode, conversation history grows with every turn. Without a 32k context window, long sessions hit the 4096-token limit and start truncating early messages — the model forgets what it did earlier in the conversation.

---

## Hardware Notes

Ollama runs on CPU if no GPU is detected.

| Hardware | Expected speed (7b model) | Time per response |
|----------|--------------------------|-------------------|
| CPU-only (modern desktop) | ~20–30 tok/s | ~10–20 sec |
| CPU-only (laptop) | ~8–15 tok/s | ~20–45 sec |
| NVIDIA GPU (8GB VRAM) | ~40–80 tok/s | ~5–15 sec |
| Apple Silicon | ~30–60 tok/s | ~5–15 sec |

### Linux: set the CPU governor to `performance`

On Linux, the default `powersave` governor runs the CPU at ~18% of max frequency. This alone causes 3–5× slower inference. Fix it:

```bash
# Immediate (this session only):
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# Persistent (survives reboots):
sudo apt install cpufrequtils
echo 'GOVERNOR="performance"' | sudo tee /etc/default/cpufrequtils
sudo systemctl restart cpufrequtils
```

Verify: `cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor` should output `performance`.

---

## What the Agent Can Do

- **Read & summarise** — fetch your column, list open tasks, answer questions
- **Create & organise** — create tasks and lists, move tasks between lists, rename
- **Act on tasks as prompts** — reads task titles as instructions, does the work, marks done
- **Respect permissions** — locked columns are left untouched; stays in own column by default
- **Graveyard** — archive lists (reversible), restore from graveyard

---

## CLI Feedback

While the model is thinking, a spinner with an elapsed-seconds counter shows on stderr:

```
⠸ Thinking... 12s
  🔧 get_column
⠦ Thinking... 4s

Ollama: You have 3 open tasks...
```

This confirms the agent is working, not stalled. Tool calls are always shown so you can see what the model is doing. Use `DEBUG=1` to also see the full arguments passed to each tool.

---

## Troubleshooting

**`Cannot connect to Ollama`** — Ollama service isn't running. Start it:
```bash
ollama serve
# or if installed as a service:
systemctl start ollama          # system-level (most Linux installs)
systemctl --user start ollama   # user-level
```

**`Model not found`** — Pull it first:
```bash
ollama pull qwen2.5:7b
```

**Agent says it has no tasks / can't find its column** — The `AGENT_NAME` in `.env` must exactly match the column's owner username on the board (case-insensitive). The agent auto-discovers its column slug at startup by matching `ownerUsername`. Check:
```bash
# See all column owners
sqlite3 ~/2DoBetter/prisma/dev.db "SELECT slug, ownerUsername FROM Column;"
```

**Slow responses** — Check the CPU governor first (Linux): `cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_gov ernor`. If it says `powersave`, see [Hardware Notes](#hardware-notes) above for the fix.

**Tool calls failing** — Some smaller models struggle with structured tool use.
Stick with `qwen2.5:7b` or larger; avoid 3b models for complex board operations.

---

## Agent Token

The `AGENT_TOKEN` is a permanent bearer token — not the same as an invite code.

- Created when you click **+ Agent** in the board header
- Shown **once** at creation — copy it immediately
- If lost: Admin panel ⚙ → find the agent column → hold **Rotate token** (1.5s) → copy new token → update `.env`
