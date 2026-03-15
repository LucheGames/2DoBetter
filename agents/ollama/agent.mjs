#!/usr/bin/env node
/**
 * 2Do Better — Ollama agent (local inference)
 *
 * Runs entirely on your own hardware — no API key, no rate limits, no cloud.
 * Requires Ollama running on the same machine as your 2Do Better server.
 *
 * Usage:
 *   npm start "What's on the board?"
 *   npm run chat
 *   echo "Add a task called Buy milk to list 5" | npm start
 *
 * Env (see .env.example):
 *   API_BASE_URL   — 2DoBetter server, e.g. https://localhost:3000
 *   AGENT_TOKEN    — agentToken from the board + Agent button
 *   OLLAMA_HOST    — Ollama server (default: http://localhost:11434)
 *   OLLAMA_MODEL   — optional model override (default: qwen2.5:7b)
 *   AGENT_NAME     — optional name shown in prompts (default: Ollama)
 */

import { createRequire } from "module";
import { createInterface } from "readline";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ── Load .env ─────────────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dir, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── Config ────────────────────────────────────────────────────────────────────
const OLLAMA_HOST  = (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, "");
const API_BASE     = (process.env.API_BASE_URL || "https://localhost:3000").replace(/\/$/, "");
const AGENT_TOKEN  = process.env.AGENT_TOKEN || "";
const AGENT_NAME   = process.env.AGENT_NAME || "Ollama";
// "qwen2.5-32k" is the custom variant created in setup with num_ctx=32768.
// The bare qwen2.5:7b defaults to 4096 tokens — too small for long --chat sessions.
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5-32k";

if (!AGENT_TOKEN) { console.error("❌  AGENT_TOKEN is not set. See .env.example."); process.exit(1); }

// ── SDK ───────────────────────────────────────────────────────────────────────
// Ollama exposes an OpenAI-compatible API — we use the openai package pointed at localhost.
const require = createRequire(import.meta.url);
let OpenAI;
try {
  OpenAI = require("openai").default ?? require("openai").OpenAI;
} catch {
  console.error("❌  openai package not found. Run: npm install");
  process.exit(1);
}
const client = new OpenAI({
  baseURL: `${OLLAMA_HOST}/v1`,
  apiKey: "ollama", // required by the SDK but ignored by Ollama
});

// ── CLI spinner ───────────────────────────────────────────────────────────────
const SPIN_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
const IS_TTY = process.stderr.isTTY;
let _spinTimer = null;
let _spinStart = 0;

function spinStart(label = 'Thinking') {
  if (!IS_TTY) return;
  _spinStart = Date.now();
  let i = 0;
  _spinTimer = setInterval(() => {
    const s = Math.floor((Date.now() - _spinStart) / 1000);
    process.stderr.write(`\r${SPIN_FRAMES[i++ % SPIN_FRAMES.length]} ${label}... ${s}s `);
  }, 100);
}

function spinStop(note = '') {
  if (!IS_TTY) return;
  if (_spinTimer) { clearInterval(_spinTimer); _spinTimer = null; }
  process.stderr.write('\r\x1b[K');  // erase spinner line
  if (note) process.stderr.write(note + '\n');
}

// ── REST helper ───────────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${AGENT_TOKEN}`,
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 204) return { success: true };
  const text = await res.text();
  if (!res.ok) return { error: `HTTP ${res.status}`, detail: text };
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

// ── Completed-task filter ─────────────────────────────────────────────────────
function stripCompleted(board) {
  if (!board?.columns) return board;
  return {
    ...board,
    columns: board.columns.map(col => ({
      ...col,
      lists: (col.lists || []).map(list => ({
        ...list,
        tasks: (list.tasks || []).filter(t => !t.completed),
      })),
    })),
  };
}

// ── Tool implementations ──────────────────────────────────────────────────────
function id(v) { return parseInt(v, 10); }

async function executeTool(name, args) {
  switch (name) {
    case "get_board": {
      return stripCompleted(await api("/api/overview"));
    }
    case "get_column": {
      const board = await api("/api/overview");
      const col = (board.columns || []).find(c => c.slug === args.column);
      if (!col) {
        const available = (board.columns || []).map(c => c.slug).join(", ");
        return { error: `Column "${args.column}" not found. Available: ${available}` };
      }
      return {
        ...col,
        lists: (col.lists || []).map(list => ({
          ...list,
          tasks: (list.tasks || []).filter(t => !t.completed),
        })),
      };
    }
    case "create_list":
      return api(`/api/columns/${id(args.columnId)}/lists`, { method: "POST", body: JSON.stringify({ name: args.name }) });
    case "create_task":
      return api(`/api/lists/${id(args.listId)}/tasks`, { method: "POST", body: JSON.stringify({ title: args.title }) });
    case "mark_done":
      return api(`/api/tasks/${id(args.taskId)}`, { method: "PATCH", body: JSON.stringify({ completed: true }) });
    case "reopen_task":
      return api(`/api/tasks/${id(args.taskId)}`, { method: "PATCH", body: JSON.stringify({ completed: false }) });
    case "update_task":
      return api(`/api/tasks/${id(args.taskId)}`, { method: "PATCH", body: JSON.stringify({ title: args.title }) });
    case "delete_task":
      await api(`/api/tasks/${id(args.taskId)}`, { method: "DELETE" });
      return { success: true, taskId: id(args.taskId) };
    case "move_task":
      return api(`/api/tasks/${id(args.taskId)}`, { method: "PATCH", body: JSON.stringify({ listId: id(args.targetListId) }) });
    case "reorder_tasks":
      return api("/api/tasks/reorder", { method: "POST", body: JSON.stringify({ ids: args.orderedIds.map(id) }) });
    case "reorder_lists":
      return api("/api/lists/reorder", { method: "POST", body: JSON.stringify({ ids: args.orderedIds.map(id) }) });
    case "rename_list":
      return api(`/api/lists/${id(args.listId)}`, { method: "PATCH", body: JSON.stringify({ name: args.name }) });
    case "move_list":
      return api(`/api/lists/${id(args.listId)}`, { method: "PATCH", body: JSON.stringify({ columnId: id(args.targetColumnId) }) });
    case "search_tasks": {
      const board = await api("/api/overview");
      const q = args.query.toLowerCase();
      const results = [];
      for (const col of board.columns || [])
        for (const list of col.lists || [])
          for (const task of list.tasks || [])
            if (task.title.toLowerCase().includes(q))
              results.push({ ...task, column: col.name, list: list.name });
      return results.length ? results : { message: `No tasks found matching "${args.query}"` };
    }
    case "archive_list":
      await api(`/api/lists/${id(args.listId)}`, { method: "DELETE" });
      return { success: true, listId: id(args.listId) };
    case "restore_list":
      return api(`/api/graveyard/${id(args.listId)}/resurrect`, { method: "POST" });
    case "get_graveyard":
      return api(args.columnId ? `/api/graveyard?columnId=${id(args.columnId)}` : "/api/graveyard");
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Tool definitions (OpenAI format) ─────────────────────────────────────────
const tools = [
  { type: "function", function: { name: "get_board",       description: "Get the full board state — all columns, lists, and incomplete tasks", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_column",      description: "Get a specific column's lists and tasks by slug", parameters: { type: "object", properties: { column: { type: "string", description: "Column slug" } }, required: ["column"] } } },
  { type: "function", function: { name: "create_list",     description: "Create a new list in a column", parameters: { type: "object", properties: { columnId: { type: "integer" }, name: { type: "string" } }, required: ["columnId", "name"] } } },
  { type: "function", function: { name: "create_task",     description: "Create a new task in a list", parameters: { type: "object", properties: { listId: { type: "integer" }, title: { type: "string" } }, required: ["listId", "title"] } } },
  { type: "function", function: { name: "mark_done",       description: "Flag a task as done on the board (use ONLY after the actual work is finished)", parameters: { type: "object", properties: { taskId: { type: "integer" } }, required: ["taskId"] } } },
  { type: "function", function: { name: "reopen_task",     description: "Reopen a task that was previously marked done", parameters: { type: "object", properties: { taskId: { type: "integer" } }, required: ["taskId"] } } },
  { type: "function", function: { name: "update_task",     description: "Update a task's title", parameters: { type: "object", properties: { taskId: { type: "integer" }, title: { type: "string" } }, required: ["taskId", "title"] } } },
  { type: "function", function: { name: "delete_task",     description: "Delete a task permanently", parameters: { type: "object", properties: { taskId: { type: "integer" } }, required: ["taskId"] } } },
  { type: "function", function: { name: "move_task",       description: "Move a task to a different list", parameters: { type: "object", properties: { taskId: { type: "integer" }, targetListId: { type: "integer" } }, required: ["taskId", "targetListId"] } } },
  { type: "function", function: { name: "reorder_tasks",   description: "Reorder tasks within a list. Provide ALL task IDs from that list in the desired order.", parameters: { type: "object", properties: { orderedIds: { type: "array", items: { type: "integer" }, description: "All task IDs in the list, in the desired order" } }, required: ["orderedIds"] } } },
  { type: "function", function: { name: "reorder_lists",   description: "Reorder lists within a column. Provide ALL list IDs from that column in the desired order.", parameters: { type: "object", properties: { orderedIds: { type: "array", items: { type: "integer" }, description: "All list IDs in the column, in the desired order" } }, required: ["orderedIds"] } } },
  { type: "function", function: { name: "rename_list",     description: "Rename a list", parameters: { type: "object", properties: { listId: { type: "integer" }, name: { type: "string" } }, required: ["listId", "name"] } } },
  { type: "function", function: { name: "move_list",       description: "Move a list to a different column", parameters: { type: "object", properties: { listId: { type: "integer" }, targetColumnId: { type: "integer" } }, required: ["listId", "targetColumnId"] } } },
  { type: "function", function: { name: "search_tasks",    description: "Search tasks by title", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "archive_list",    description: "Archive a list to the graveyard", parameters: { type: "object", properties: { listId: { type: "integer" } }, required: ["listId"] } } },
  { type: "function", function: { name: "restore_list",    description: "Restore an archived list", parameters: { type: "object", properties: { listId: { type: "integer" } }, required: ["listId"] } } },
  { type: "function", function: { name: "get_graveyard",   description: "List archived lists, optionally filtered by column", parameters: { type: "object", properties: { columnId: { type: "integer" } }, required: [] } } },
];

// ── Agent column discovery ─────────────────────────────────────────────────────
// The column slug is generated at creation time (e.g. "ollama-1773581576361").
// We discover it once at startup so the model always knows how to call get_column.
let AGENT_SLUG = null;

async function discoverAgentSlug() {
  try {
    const board = await api("/api/overview");
    const col = (board.columns || []).find(
      c => c.ownerUsername?.toLowerCase() === AGENT_NAME.toLowerCase()
    );
    if (col) {
      AGENT_SLUG = col.slug;
    } else {
      console.error(`⚠️  No column found for agent "${AGENT_NAME}". Check AGENT_NAME in .env matches the column owner.`);
    }
  } catch (err) {
    console.error(`⚠️  Could not discover agent column: ${err.message}`);
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt() {
  const slugLine = AGENT_SLUG
    ? `Your column slug is: **${AGENT_SLUG}** — always call get_column("${AGENT_SLUG}") first to fetch your current tasks and list IDs.`
    : `Call get_board to find your column (look for ownerUsername: "${AGENT_NAME}"), then use get_column with your slug.`;

  return `You are ${AGENT_NAME}, an AI agent connected to the 2Do Better collaborative task board.
You run entirely on local hardware — no cloud, no API keys.

You have a dedicated column on the board. Your supervisor can review and manage your column at any time.
${slugLine}

## Scope
- Focus only on your own column unless explicitly asked about others.
- Treat completed tasks as invisible — they are already done. Never modify them unless explicitly told to.
- Never look in the graveyard (archived lists) unless explicitly asked to.
- Never delete tasks or lists unless explicitly told to delete. Completing a task is not the same as deleting it.

## Acting on tasks
Tasks are prompts, not checkboxes. Before marking any task done, you must do the actual work it describes:
- Question task ("What are the risks?") → write a thorough answer in your response, THEN mark done.
- Action task ("Rename this list", "Add a subtask") → call the right tool to do it, THEN mark done.
- Thinking task ("Identify risks", "Analyse the sprint", "Summarise") → reason through it and write your output in the response, THEN mark done.
- NEVER call mark_done without first producing an answer, reasoning, or performing a tool action. Silently ticking a box is always wrong.
- When the user says "complete", "do", "handle", or "work through" the tasks — they mean do the work above, not just mark them done.

## Reordering
- To reorder tasks within a list, use reorder_tasks with ALL task IDs from that list in the desired order.
- To reorder lists within a column, use reorder_lists with ALL list IDs from that column in the desired order.
- You must include every ID — omitting one removes it from the order.

## Speed — batch your tool calls
- When multiple independent operations are needed, issue ALL of them in a single response as parallel tool calls.
- Only make a second round of tool calls if a later operation genuinely depends on the result of an earlier one.

## Writing to the board
- Always call get_column("${AGENT_SLUG || 'your-slug'}") at the start — you need fresh IDs before creating or moving anything.
- Never create duplicate tasks. Check if a similar task exists before adding one.
- Keep task titles concise and actionable (under 80 characters).
- Don't create more than 5 tasks at once unless explicitly asked for a larger batch.
- Place new tasks and lists in your own column by default — unless told to put them elsewhere.
- Never touch another user's column without being explicitly told to.

## Responses
- Be concise. Summarise what you did rather than dumping raw JSON.
- When creating tasks, confirm: task title + which list it went into.
- When finishing tasks, say what work you did before marking done.

## Multi-step sequences — never stop early
When a request requires multiple sequential rounds (e.g. create a list, then add tasks):
- Round 1: call create_list → the response gives you the new list's ID
- Round 2: immediately call create_task × N in parallel using that ID
- Round 3: if reordering was requested, call reorder_tasks with all new task IDs in order
Never reply mid-sequence. Only respond to the user after every step is complete.
- NEVER end with "there are no tasks" or "your board is empty" — that is unhelpful after you have just completed work. Instead, summarise what you accomplished.`;
}

// ── Agentic loop ──────────────────────────────────────────────────────────────

/** Run one turn. Pass a persistent messages array for --chat memory. */
async function runTurn(messages, userPrompt) {
  messages.push({ role: "user", content: userPrompt });

  // Agentic loop — keep going until no more tool calls
  for (let round = 0; round < 20; round++) {
    spinStart('Thinking');
    let response;
    try {
      response = await client.chat.completions.create({
        model: OLLAMA_MODEL,
        messages,
        tools,
        tool_choice: "auto",
      });
    } catch (err) {
      spinStop();
      if (err.code === "ECONNREFUSED" || err.message?.includes("ECONNREFUSED")) {
        throw new Error(`Cannot connect to Ollama at ${OLLAMA_HOST}. Is Ollama running? Try: ollama serve`);
      }
      if (err.message?.includes("model") && err.message?.includes("not found")) {
        throw new Error(`Model "${OLLAMA_MODEL}" not found. Pull it first: ollama pull ${OLLAMA_MODEL}`);
      }
      throw err;
    }

    const msg = response.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls?.length) { spinStop(); break; }

    // Show which tools are being called, then execute them in parallel
    const toolNames = msg.tool_calls.map(c => c.function.name).join(' + ');
    spinStop(`  🔧 ${toolNames}`);

    const toolResults = await Promise.all(
      msg.tool_calls.map(async (call) => {
        if (process.env.DEBUG) console.error(`     ${call.function.name}(${call.function.arguments})`);
        let args = {};
        try { args = JSON.parse(call.function.arguments); } catch { /* malformed args */ }
        const result = await executeTool(call.function.name, args);
        return { role: "tool", tool_call_id: call.id, content: JSON.stringify(result) };
      })
    );
    for (const r of toolResults) messages.push(r);
  }

  const last = messages.findLast(m => m.role === "assistant" && m.content);
  return last?.content || "(no response)";
}

/** Single-shot: fresh context each call. */
async function runAgent(userPrompt) {
  const messages = [{ role: "system", content: buildSystemPrompt() }];
  return runTurn(messages, userPrompt);
}

/** Persistent context for --chat mode. */
function createSession() {
  return [{ role: "system", content: buildSystemPrompt() }];
}

// ── CLI entry ─────────────────────────────────────────────────────────────────
async function main() {
  // Discover agent's column slug once at startup — needed for system prompt and tool calls
  await discoverAgentSlug();

  const args = process.argv.slice(2);

  if (args[0] === "--chat") {
    console.log(`${AGENT_NAME} is ready. Type your message and press Enter. Ctrl+C to exit.\n`);
    const messages = createSession();
    const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "You: " });
    rl.prompt();
    rl.on("line", async (line) => {
      const input = line.trim();
      if (!input) { rl.prompt(); return; }
      try {
        const reply = await runTurn(messages, input);
        console.log(`${AGENT_NAME}: ${reply}\n`);
      } catch (err) {
        console.error(`Error: ${err.message}\n`);
      }
      rl.prompt();
    });
    rl.on("close", () => { console.log("\nBye!"); process.exit(0); });
    return;
  }

  let prompt = args.join(" ").trim();
  if (!prompt && !process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    prompt = Buffer.concat(chunks).toString("utf8").trim();
  }

  if (!prompt) {
    console.error(`Usage:\n  npm start "Your message"\n  npm run chat`);
    process.exit(1);
  }

  try {
    console.log(await runAgent(prompt));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

main();
