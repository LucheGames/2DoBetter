#!/usr/bin/env node
/**
 * 2Do Better — Gemini agent
 *
 * Usage:
 *   node agent.mjs "What's on the board?"
 *   node agent.mjs --chat
 *   echo "Add a task called Buy milk to list 5" | node agent.mjs
 *
 * Env (see .env.example):
 *   GEMINI_API_KEY   — Google AI Studio API key
 *   API_BASE_URL     — 2DoBetter server, e.g. https://2dobetter.duckdns.org:3000
 *   AGENT_TOKEN      — agentToken from users.json / admin panel
 *   AGENT_NAME       — name shown in system prompt (default: "Gemini")
 */

import { createRequire } from "module";
import { createInterface } from "readline";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ── Load .env if present ──────────────────────────────────────────────────────
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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const API_BASE       = (process.env.API_BASE_URL || "https://localhost:3000").replace(/\/$/, "");
const AGENT_TOKEN    = process.env.AGENT_TOKEN || "";
const AGENT_NAME     = process.env.AGENT_NAME || "Gemini";

if (!GEMINI_API_KEY) {
  console.error("❌  GEMINI_API_KEY is not set. See .env.example.");
  process.exit(1);
}
if (!AGENT_TOKEN) {
  console.error("❌  AGENT_TOKEN is not set. See .env.example.");
  process.exit(1);
}

// NODE_TLS_REJECT_UNAUTHORIZED=0 is set by npm scripts before Node starts.
// Setting it here as a fallback for direct node invocation.
if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

// ── SDK import (dynamic — works after npm install) ────────────────────────────
const require = createRequire(import.meta.url);
let GoogleGenerativeAI;
try {
  ({ GoogleGenerativeAI } = require("@google/generative-ai"));
} catch {
  console.error("❌  @google/generative-ai not found. Run: npm install");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip completed tasks from board data before sending to Gemini.
 *  Keeps token count low and prevents Gemini acting on already-done work. */
function stripCompleted(board) {
  if (!board || !board.columns) return board;
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
async function executeTool(name, args) {
  switch (name) {
    case "get_board": {
      const board = await api("/api/overview");
      return stripCompleted(board);
    }
    case "get_column": {
      const board = await api("/api/overview");
      const col = (board.columns || []).find(c => c.slug === args.column);
      if (!col) {
        const available = (board.columns || []).map(c => c.slug).join(", ");
        return { error: `Column "${args.column}" not found. Available: ${available}` };
      }
      // Strip completed tasks from the single column too
      return {
        ...col,
        lists: (col.lists || []).map(list => ({
          ...list,
          tasks: (list.tasks || []).filter(t => !t.completed),
        })),
      };
    }
    case "create_list": {
      return await api(`/api/columns/${args.columnId}/lists`, {
        method: "POST",
        body: JSON.stringify({ name: args.name }),
      });
    }
    case "create_task": {
      return await api(`/api/lists/${args.listId}/tasks`, {
        method: "POST",
        body: JSON.stringify({ title: args.title }),
      });
    }
    case "complete_task": {
      return await api(`/api/tasks/${args.taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: true }),
      });
    }
    case "uncomplete_task": {
      return await api(`/api/tasks/${args.taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ completed: false }),
      });
    }
    case "update_task": {
      return await api(`/api/tasks/${args.taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: args.title }),
      });
    }
    case "delete_task": {
      await api(`/api/tasks/${args.taskId}`, { method: "DELETE" });
      return { success: true, taskId: args.taskId };
    }
    case "move_task": {
      return await api(`/api/tasks/${args.taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ listId: args.targetListId }),
      });
    }
    case "rename_list": {
      return await api(`/api/lists/${args.listId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: args.name }),
      });
    }
    case "move_list": {
      return await api(`/api/lists/${args.listId}`, {
        method: "PATCH",
        body: JSON.stringify({ columnId: args.targetColumnId }),
      });
    }
    case "search_tasks": {
      const board = await api("/api/overview");
      const q = args.query.toLowerCase();
      const results = [];
      for (const col of board.columns || []) {
        for (const list of col.lists || []) {
          for (const task of list.tasks || []) {
            if (task.title.toLowerCase().includes(q)) {
              results.push({ ...task, column: col.name, list: list.name });
            }
          }
        }
      }
      return results.length > 0 ? results : { message: `No tasks found matching "${args.query}"` };
    }
    case "archive_list": {
      await api(`/api/lists/${args.listId}`, { method: "DELETE" });
      return { success: true, listId: args.listId };
    }
    case "restore_list": {
      return await api(`/api/graveyard/${args.listId}/resurrect`, { method: "POST" });
    }
    case "get_graveyard": {
      const path = args.columnId ? `/api/graveyard?columnId=${args.columnId}` : "/api/graveyard";
      return await api(path);
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ── Gemini function declarations ──────────────────────────────────────────────
const tools = [
  {
    functionDeclarations: [
      {
        name: "get_board",
        description: "Get the full board state — all columns, lists, and tasks",
        parameters: { type: "OBJECT", properties: {}, required: [] },
      },
      {
        name: "get_column",
        description: "Get a specific column's lists and tasks by slug (e.g. 'alice', 'bob')",
        parameters: {
          type: "OBJECT",
          properties: {
            column: { type: "STRING", description: "Column slug (e.g. 'alice', 'bob')" },
          },
          required: ["column"],
        },
      },
      {
        name: "create_list",
        description: "Create a new list in a column",
        parameters: {
          type: "OBJECT",
          properties: {
            columnId: { type: "NUMBER", description: "Column ID" },
            name:     { type: "STRING", description: "List name" },
          },
          required: ["columnId", "name"],
        },
      },
      {
        name: "create_task",
        description: "Create a new task in a list",
        parameters: {
          type: "OBJECT",
          properties: {
            listId: { type: "NUMBER", description: "List ID to add the task to" },
            title:  { type: "STRING", description: "Task title" },
          },
          required: ["listId", "title"],
        },
      },
      {
        name: "complete_task",
        description: "Mark a task as completed",
        parameters: {
          type: "OBJECT",
          properties: {
            taskId: { type: "NUMBER", description: "Task ID" },
          },
          required: ["taskId"],
        },
      },
      {
        name: "uncomplete_task",
        description: "Reinstate a completed task (mark as not completed)",
        parameters: {
          type: "OBJECT",
          properties: {
            taskId: { type: "NUMBER", description: "Task ID" },
          },
          required: ["taskId"],
        },
      },
      {
        name: "update_task",
        description: "Update a task's title",
        parameters: {
          type: "OBJECT",
          properties: {
            taskId: { type: "NUMBER", description: "Task ID" },
            title:  { type: "STRING", description: "New task title" },
          },
          required: ["taskId", "title"],
        },
      },
      {
        name: "delete_task",
        description: "Delete a task permanently",
        parameters: {
          type: "OBJECT",
          properties: {
            taskId: { type: "NUMBER", description: "Task ID" },
          },
          required: ["taskId"],
        },
      },
      {
        name: "move_task",
        description: "Move a task to a different list",
        parameters: {
          type: "OBJECT",
          properties: {
            taskId:       { type: "NUMBER", description: "Task ID" },
            targetListId: { type: "NUMBER", description: "Target list ID" },
          },
          required: ["taskId", "targetListId"],
        },
      },
      {
        name: "rename_list",
        description: "Rename a list",
        parameters: {
          type: "OBJECT",
          properties: {
            listId: { type: "NUMBER", description: "List ID" },
            name:   { type: "STRING", description: "New list name" },
          },
          required: ["listId", "name"],
        },
      },
      {
        name: "move_list",
        description: "Move a list to a different column",
        parameters: {
          type: "OBJECT",
          properties: {
            listId:         { type: "NUMBER", description: "List ID" },
            targetColumnId: { type: "NUMBER", description: "Target column ID" },
          },
          required: ["listId", "targetColumnId"],
        },
      },
      {
        name: "search_tasks",
        description: "Search all tasks by title (case-insensitive substring match)",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Search query" },
          },
          required: ["query"],
        },
      },
      {
        name: "archive_list",
        description: "Archive a list to the graveyard (soft-delete — recoverable)",
        parameters: {
          type: "OBJECT",
          properties: {
            listId: { type: "NUMBER", description: "List ID" },
          },
          required: ["listId"],
        },
      },
      {
        name: "restore_list",
        description: "Restore an archived list from the graveyard back to the board",
        parameters: {
          type: "OBJECT",
          properties: {
            listId: { type: "NUMBER", description: "List ID" },
          },
          required: ["listId"],
        },
      },
      {
        name: "get_graveyard",
        description: "List all archived lists in the graveyard, optionally filtered by column",
        parameters: {
          type: "OBJECT",
          properties: {
            columnId: { type: "NUMBER", description: "Filter by column ID (optional)" },
          },
          required: [],
        },
      },
    ],
  },
];

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are ${AGENT_NAME}, an AI agent connected to the 2Do Better collaborative task board.

You have a dedicated column on the board. Your supervisor can review and manage your column at any time.

## Scope
- Focus only on your own column unless explicitly asked about others.
- Treat completed tasks as invisible — they are already done. Never modify them unless explicitly told to.
- Never look in the graveyard (archived lists) unless explicitly asked to.
- Never delete tasks or lists unless explicitly told to delete. Completing a task is not the same as deleting it.

## Reading tasks as prompts
- If a task title describes an action ("rename this list", "add a task", "summarise the board"), PERFORM that action using the appropriate tool FIRST, then mark the task complete.
- If a task title is a question, answer it in your response, then mark it complete.
- Think carefully — don't just check boxes, reason through what the task is actually asking you to do.
- "Complete the tasks" means: read each task, do what it says, then mark it done.

## Writing to the board
- Always use the IDs from the board context provided at the start of each message — do not call get_board again unless something may have changed mid-turn.
- Never create duplicate tasks. Check if a similar task exists before adding one.
- Keep task titles concise and actionable (under 80 characters).
- Don't create more than 5 tasks at once unless explicitly asked for a larger batch.
- Never touch another user's column without being explicitly told to.

## Responses
- Be concise. Summarise what you did rather than dumping raw JSON.
- When creating tasks, confirm: task title + which list it went into.
- When completing tasks, say what action you performed (e.g. "renamed list to X, then marked the task complete").
- If asked to do something requiring multiple steps, do them all before responding.
- NEVER end with "there are no tasks" or "your board is empty" — that is unhelpful after you have just completed work. Instead, summarise what you accomplished.`;

// ── Agentic loop ──────────────────────────────────────────────────────────────

/** Extract text from a Gemini response, handling thinking tokens in 2.5 Flash. */
function extractText(response) {
  try {
    // Standard path — works for most responses
    const text = response.response.text();
    if (text) return text;
  } catch { /* fall through to manual extraction */ }

  // Manual extraction: find the first text part that isn't a thinking part
  const parts = response.response?.candidates?.[0]?.content?.parts || [];
  const textPart = parts.find(p => p.text && !p.thought);
  return textPart?.text || "(no response)";
}

/** Send a message with automatic retry on rate limit (429). */
async function sendWithRetry(chat, message, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await chat.sendMessage(message);
    } catch (err) {
      const is429 = err.message?.includes("429") || err.message?.includes("quota") || err.message?.includes("rate");
      if (is429 && attempt < maxRetries) {
        // Extract retry delay from error if present, otherwise back off exponentially
        // Extract retry delay — look for retryDelay field or "retry in Xs" phrase
        // Cap at 90s to guard against Google embedding large numbers in error JSON
        const match = err.message?.match(/"retryDelay":"(\d+)s"/) || err.message?.match(/retry in (\d+(?:\.\d+)?)s/i);
        const raw = match ? parseFloat(match[1]) * 1000 : (2 ** attempt) * 15000;
        const wait = Math.min(raw, 90000);
        console.error(`\n⏳ Rate limit hit — waiting ${Math.round(wait/1000)}s…`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw err;
      }
    }
  }
}

/** Run one agentic turn on an existing chat session.
 *  Pre-fetches board state so Gemini doesn't need a tool call for reads.
 *  Read-only queries = 1 API call. Writes = 2. */
async function runTurn(chat, userPrompt) {
  // Fetch board from our server (free — no Gemini API call) and inject as context.
  // Gemini gets current state immediately; no need to call get_board as a tool.
  let boardContext = "";
  try {
    const board = stripCompleted(await api("/api/overview"));
    boardContext = `[Current board state — do not call get_board, this is already fresh]\n${JSON.stringify(board, null, 2)}\n\n`;
  } catch { /* non-fatal — Gemini can still use tools if pre-fetch fails */ }

  let response = await sendWithRetry(chat, boardContext + userPrompt);

  // Loop until Gemini stops requesting tool calls
  for (let round = 0; round < 20; round++) {
    const calls = response.response.functionCalls();
    if (!calls || calls.length === 0) break;

    // Execute all tool calls (Gemini may batch multiple)
    const functionResponses = [];
    for (const call of calls) {
      if (process.env.DEBUG) {
        console.error(`  🔧 ${call.name}(${JSON.stringify(call.args)})`);
      }
      const result = await executeTool(call.name, call.args || {});
      functionResponses.push({
        functionResponse: {
          name: call.name,
          response: { result },
        },
      });
    }

    response = await sendWithRetry(chat, functionResponses);
  }

  return extractText(response);
}

/** Single-shot: create a fresh model + chat and run one turn. */
async function runAgent(userPrompt) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
    tools,
  });
  return runTurn(model.startChat(), userPrompt);
}

/** Create a persistent model + chat for use across multiple turns. */
function createChat() {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_PROMPT,
    tools,
  });
  return model.startChat();
}

// ── CLI entry ─────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  // Interactive REPL mode (--chat avoids clash with Node's built-in --interactive flag)
  if (args[0] === "--chat") {
    console.log(`${AGENT_NAME} is ready. Type your message and press Enter. Ctrl+C to exit.\n`);
    // Single persistent chat — Gemini remembers the full conversation
    const chat = createChat();
    const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "You: " });
    rl.prompt();
    rl.on("line", async (line) => {
      const input = line.trim();
      if (!input) { rl.prompt(); return; }
      try {
        process.stdout.write(`${AGENT_NAME}: `);
        const reply = await runTurn(chat, input);
        console.log(reply + "\n");
      } catch (err) {
        console.error(`Error: ${err.message}\n`);
      }
      rl.prompt();
    });
    rl.on("close", () => { console.log("\nBye!"); process.exit(0); });
    return;
  }

  // Single-shot: message from args or stdin
  let prompt = args.join(" ").trim();
  if (!prompt && !process.stdin.isTTY) {
    // Read from piped stdin
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    prompt = Buffer.concat(chunks).toString("utf8").trim();
  }

  if (!prompt) {
    console.error(`Usage:
  node agent.mjs "Your message here"
  node agent.mjs --chat
  echo "message" | node agent.mjs`);
    process.exit(1);
  }

  try {
    const reply = await runAgent(prompt);
    console.log(reply);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

main();
