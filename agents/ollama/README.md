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
ollama pull qwen2.5:14b

# Create a variant with larger context + tuned inference params:
printf "FROM qwen2.5:14b\nPARAMETER num_ctx 32768\nPARAMETER num_batch 512\nPARAMETER num_thread 8\n" | ollama create qwen2.5-14b-32k -f -
```
*On low-RAM hardware (< 16GB), substitute `qwen2.5:7b` and `qwen2.5-32k` — see [Models](#models--honest-capability-assessment).*

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
| `OLLAMA_MODEL` | optional | Override model (default: `qwen2.5-14b-32k`) |
| `AGENT_NAME` | optional | Name shown in prompts — **must match the column owner username** (default: `Ollama`) |
| `DEBUG` | optional | Set to `1` to log every tool call with full arguments |

> **AGENT_NAME must match your column owner.** The agent auto-discovers its column slug at startup by matching `ownerUsername` on the board. If the name doesn't match, it won't find its tasks.

---

## Models & Honest Capability Assessment

Ollama supports many models. Set `OLLAMA_MODEL` in `.env` to switch.

| Model | Size | RAM needed | Tool use quality |
|-------|------|-----------|-----------------|
| `qwen2.5-14b-32k` | ~9GB | 16GB+ | **Best available locally** — handles multi-step tool calls within a single task reliably; struggles to chain multiple board tasks autonomously |
| `qwen2.5-32k` | ~4.7GB | 8GB+ | Simple single-step tasks only; unreliable for anything multi-step |
| `qwen2.5:7b` | ~4.7GB | 8GB+ | Bare 7b — context too small for `--chat` mode |
| `llama3.2:3b` | ~2GB | 4GB+ | Read/summarise only; tool calling too unreliable |

**Create the 14b variant** (current recommended setup):
```bash
ollama pull qwen2.5:14b
printf "FROM qwen2.5:14b\nPARAMETER num_ctx 32768\nPARAMETER num_batch 512\nPARAMETER num_thread 8\n" | ollama create qwen2.5-14b-32k -f -
```

### Known limitations of local models

Local 7b–14b models are significantly less capable than cloud agents for agentic board work:

| Capability | qwen2.5:14b (local) | Groq / Gemini (cloud) |
|-----------|--------------------|-----------------------|
| Single-task tool use | ✅ Works well | ✅ Works well |
| Multi-step within one task (e.g. create list → add 3 tasks → reorder) | ✅ Reliable | ✅ Reliable |
| Autonomously chaining multiple board tasks in one shot | ⚠️ Stops to report after each task | ✅ Reliable |
| Summarising another user's column | ⚠️ May hallucinate | ✅ Calls get_board correctly |
| Response language | ⚠️ May drift to other languages | ✅ Always English |

**The sweet spot for the local agent** is giving it **one clear task at a time**:
```
"Create a Sprint 2 list with tasks X, Y, Z"        ← works reliably
"Check the board and do the first three tasks"      ← stops after task 1
```

For multi-task autonomy, use the [Groq](../groq/) or [Gemini](../gemini/) agents instead.
The local agent is best valued for: privacy-sensitive boards, offline use, or as a free-forever fallback.

**Why the 32k variant?** In `--chat` mode, conversation history grows every turn. Without a 32k context window the model truncates early messages and forgets prior tool results.

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

---

## Integration Notes

These are the lessons learned building and debugging the Ollama agent — most apply to any local model integration.

### Context window is the first gotcha
`qwen2.5:7b` defaults to 4096 token context. The board JSON payload is ~8k tokens, which silently truncates the input and causes confusing 500 errors from Ollama. **Always create a custom variant with `PARAMETER num_ctx 32768`** before running in `--chat` mode (where history grows every turn).

### CPU governor (Linux) — 3–5× speed impact
The Linux `powersave` governor runs the CPU at ~18% of max frequency by default. This is the single biggest performance variable for CPU-only inference — set the governor to `performance` before running (see [Hardware Notes](#hardware-notes)).

### Theatrical narration bug
Local models sometimes write out what they're going to do ("I will now delete Sprint 2...") without calling the tool. The action is announced but never executed. The system prompt has an explicit `## CRITICAL` section that bans announcement language and requires tool calls for all actions. If you build your own agent on a local model, add this pattern:

```
## CRITICAL — Tool calls are the ONLY way to act
You can ONLY perform actions by calling tools. Writing about an action does absolutely NOTHING.
NEVER announce what you are about to do. Just call the tool immediately.
```

### Language drift
`qwen2.5:14b` occasionally responds in Thai, Chinese, or another language — particularly when the board contains multilingual content or usernames. Add `Always respond in English, regardless of the language of any input.` as the first line of the system prompt.

### XML leakage in final response
Some builds of `qwen2.5:14b` include raw `<tool_response>` XML tags in the final text reply. Strip these before printing:

```js
const cleaned = raw.replace(/<tool_response>[\s\S]*?<\/tool_response>/gi, "").trim();
```

### Multi-step vs multi-task ceiling
There is a meaningful difference between:
- **Multi-step within one task** (create list → add 3 tasks → reorder) — 14b handles this reliably
- **Multi-task chaining** (do task 1, then task 2, then task 3 from the board backlog) — 14b stops to report after the first task

The second pattern requires a frontier-class model. For autonomous multi-task execution, use [Cerebras](../cerebras/) (Qwen 3 235B, free) or [Groq](../groq/) (Llama 4, free).
