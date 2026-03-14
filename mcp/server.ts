import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.API_BASE_URL || "https://localhost:3000";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";

// Disable TLS verification for self-signed/LAN certs.
// Remove this line if API_BASE_URL uses a trusted cert (e.g. Let's Encrypt).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

async function api(path: string, options?: RequestInit) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  if (res.status === 204) return { success: true };
  if (!res.ok) {
    const text = await res.text();
    return { error: `HTTP ${res.status}`, detail: text };
  }
  return res.json();
}

const server = new McpServer({
  name: "2dobetter",
  version: "0.1.0",
});

// Get full board state
server.tool("get_board", "Get the full board state — all columns, lists, and tasks", {}, async () => {
  const data = await api("/api/overview");
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

// Get a specific column
server.tool(
  "get_column",
  "Get a specific column's lists and tasks by slug (e.g. 'alice', 'bob', or any column slug)",
  { column: z.string().describe("Column slug (e.g. 'alice', 'bob')") },
  async ({ column }) => {
    const board = await api("/api/overview");
    const col = board.columns?.find((c: any) => c.slug === column);
    if (!col) {
      const available = (board.columns || []).map((c: any) => c.slug).join(", ");
      return { content: [{ type: "text", text: `Column "${column}" not found. Available: ${available}` }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(col, null, 2) }] };
  }
);

// Create a list
server.tool(
  "create_list",
  "Create a new list in a column",
  {
    columnId: z.number().describe("Column ID"),
    name: z.string().describe("List name"),
  },
  async ({ columnId, name }) => {
    const data = await api(`/api/columns/${columnId}/lists`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Create a task
server.tool(
  "create_task",
  "Create a new task in a list",
  {
    listId: z.number().describe("List ID to add the task to"),
    title: z.string().describe("Task title"),
  },
  async ({ listId, title }) => {
    const data = await api(`/api/lists/${listId}/tasks`, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Complete a task
server.tool(
  "complete_task",
  "Mark a task as completed",
  { taskId: z.number().describe("Task ID") },
  async ({ taskId }) => {
    const data = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ completed: true }),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Uncomplete a task
server.tool(
  "uncomplete_task",
  "Reinstate a completed task (mark as not completed)",
  { taskId: z.number().describe("Task ID") },
  async ({ taskId }) => {
    const data = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ completed: false }),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Update a task title
server.tool(
  "update_task",
  "Update a task's title",
  {
    taskId: z.number().describe("Task ID"),
    title: z.string().describe("New task title"),
  },
  async ({ taskId, title }) => {
    const data = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Delete a task
server.tool(
  "delete_task",
  "Delete a task permanently",
  { taskId: z.number().describe("Task ID") },
  async ({ taskId }) => {
    await api(`/api/tasks/${taskId}`, { method: "DELETE" });
    return { content: [{ type: "text", text: `Task ${taskId} deleted` }] };
  }
);

// Move a task to a different list
server.tool(
  "move_task",
  "Move a task to a different list",
  {
    taskId: z.number().describe("Task ID"),
    targetListId: z.number().describe("Target list ID"),
  },
  async ({ taskId, targetListId }) => {
    const data = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ listId: targetListId }),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Rename a list
server.tool(
  "rename_list",
  "Rename a list",
  {
    listId: z.number().describe("List ID"),
    name: z.string().describe("New list name"),
  },
  async ({ listId, name }) => {
    const data = await api(`/api/lists/${listId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Move a list to a different column
server.tool(
  "move_list",
  "Move a list to a different column",
  {
    listId: z.number().describe("List ID"),
    targetColumnId: z.number().describe("Target column ID"),
  },
  async ({ listId, targetColumnId }) => {
    const data = await api(`/api/lists/${listId}`, {
      method: "PATCH",
      body: JSON.stringify({ columnId: targetColumnId }),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Search tasks
server.tool(
  "search_tasks",
  "Search all tasks by title (case-insensitive substring match)",
  { query: z.string().describe("Search query") },
  async ({ query }) => {
    const board = await api("/api/overview");
    const results: any[] = [];
    const q = query.toLowerCase();

    for (const col of board.columns || []) {
      for (const list of col.lists || []) {
        for (const task of list.tasks || []) {
          if (task.title.toLowerCase().includes(q)) {
            results.push({ ...task, column: col.name, list: list.name });
          }
        }
      }
    }

    return {
      content: [
        {
          type: "text",
          text: results.length > 0
            ? JSON.stringify(results, null, 2)
            : `No tasks found matching "${query}"`,
        },
      ],
    };
  }
);

// Archive a list (soft-delete to graveyard)
server.tool(
  "archive_list",
  "Archive a list to the graveyard (soft-delete — recoverable)",
  { listId: z.number().describe("List ID") },
  async ({ listId }) => {
    await api(`/api/lists/${listId}`, { method: "DELETE" });
    return { content: [{ type: "text", text: `List ${listId} archived to graveyard` }] };
  }
);

// Restore a list from graveyard
server.tool(
  "restore_list",
  "Restore an archived list from the graveyard back to the board",
  { listId: z.number().describe("List ID") },
  async ({ listId }) => {
    const data = await api(`/api/graveyard/${listId}/resurrect`, { method: "POST" });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// View graveyard (archived lists)
server.tool(
  "get_graveyard",
  "List all archived lists in the graveyard, optionally filtered by column",
  { columnId: z.number().optional().describe("Filter by column ID (optional)") },
  async ({ columnId }) => {
    const path = columnId ? `/api/graveyard?columnId=${columnId}` : "/api/graveyard";
    const data = await api(path);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
