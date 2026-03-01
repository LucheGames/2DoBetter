import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.API_BASE_URL || "http://localhost:3000";

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (res.status === 204) return { success: true };
  return res.json();
}

const server = new McpServer({
  name: "2dobetter",
  version: "0.1.0",
});

// Get full board state
server.tool("get_board", "Get the full board state — all columns, lists, sub-lists, and tasks", {}, async () => {
  const data = await api("/api/overview");
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
});

// Get a specific column
server.tool(
  "get_column",
  "Get a specific column's lists and tasks by slug (dave or claude)",
  { column: z.enum(["dave", "claude"]).describe("Column slug") },
  async ({ column }) => {
    const board = await api("/api/overview");
    const col = board.columns?.find((c: any) => c.slug === column);
    if (!col) return { content: [{ type: "text", text: `Column "${column}" not found` }] };
    return { content: [{ type: "text", text: JSON.stringify(col, null, 2) }] };
  }
);

// Create a list
server.tool(
  "create_list",
  "Create a new list in a column",
  {
    columnId: z.number().describe("Column ID (1=Dave, 2=Claude)"),
    name: z.string().describe("List name"),
    parentListId: z.number().optional().describe("Parent list ID for sub-lists"),
  },
  async ({ columnId, name, parentListId }) => {
    let data;
    if (parentListId) {
      data = await api(`/api/lists/${parentListId}/children`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    } else {
      data = await api(`/api/columns/${columnId}/lists`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    }
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

// Update a task
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
        for (const child of list.children || []) {
          for (const task of child.tasks || []) {
            if (task.title.toLowerCase().includes(q)) {
              results.push({ ...task, column: col.name, list: `${list.name} > ${child.name}` });
            }
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

// Delete a list
server.tool(
  "delete_list",
  "Delete a list and all its tasks",
  { listId: z.number().describe("List ID") },
  async ({ listId }) => {
    await api(`/api/lists/${listId}`, { method: "DELETE" });
    return { content: [{ type: "text", text: `List ${listId} deleted` }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
