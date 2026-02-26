"use client";

import { useEffect, useRef, useState } from "react";

type List = { id: number; name: string; _count: { tasks: number } };
type Task = {
  id: number;
  listId: number;
  title: string;
  completed: boolean;
  completedAt: string | null;
  order: number;
  createdAt: string;
};

function groupByDate(tasks: Task[]): Record<string, Task[]> {
  return tasks.reduce(
    (acc, task) => {
      const key = task.completedAt
        ? new Date(task.completedAt).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : "Unknown";
      (acc[key] = acc[key] || []).push(task);
      return acc;
    },
    {} as Record<string, Task[]>
  );
}

export default function Home() {
  const [lists, setLists] = useState<List[]>([]);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newListName, setNewListName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [editingListName, setEditingListName] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const taskInputRef = useRef<HTMLInputElement>(null);

  async function fetchLists() {
    const res = await fetch("/api/lists");
    const data = await res.json();
    setLists(data);
    if (!selectedListId && data.length > 0) setSelectedListId(data[0].id);
  }

  async function fetchTasks(listId: number) {
    const res = await fetch(`/api/lists/${listId}/tasks`);
    const data = await res.json();
    setTasks(data);
  }

  useEffect(() => {
    fetchLists();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedListId) fetchTasks(selectedListId);
    else setTasks([]);
  }, [selectedListId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    if (!newListName.trim()) return;
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newListName }),
    });
    const list = await res.json();
    setNewListName("");
    setLists((prev) => [...prev, { ...list, _count: { tasks: 0 } }]);
    setSelectedListId(list.id);
  }

  async function deleteList(id: number) {
    await fetch(`/api/lists/${id}`, { method: "DELETE" });
    const remaining = lists.filter((l) => l.id !== id);
    setLists(remaining);
    if (selectedListId === id) setSelectedListId(remaining[0]?.id ?? null);
  }

  async function saveListName(id: number) {
    if (!editingListName.trim()) return;
    await fetch(`/api/lists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingListName }),
    });
    setLists((prev) =>
      prev.map((l) => (l.id === id ? { ...l, name: editingListName } : l))
    );
    setEditingListId(null);
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim() || !selectedListId) return;
    const res = await fetch(`/api/lists/${selectedListId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTaskTitle }),
    });
    const task = await res.json();
    setNewTaskTitle("");
    setTasks((prev) => [task, ...prev]);
    taskInputRef.current?.focus();
  }

  async function toggleTask(task: Task) {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !task.completed }),
    });
    const updated = await res.json();
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    fetchLists();
  }

  async function deleteTask(id: number) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== id));
    fetchLists();
  }

  async function saveTaskTitle(id: number) {
    if (!editingTaskTitle.trim()) return;
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editingTaskTitle }),
    });
    const updated = await res.json();
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    setEditingTaskId(null);
  }

  const activeTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);
  const completedGroups = groupByDate(completedTasks);
  const sortedGroupKeys = Object.keys(completedGroups).sort((a, b) => {
    const dateA = completedGroups[a][0]?.completedAt ?? "";
    const dateB = completedGroups[b][0]?.completedAt ?? "";
    return dateB.localeCompare(dateA);
  });

  const selectedList = lists.find((l) => l.id === selectedListId);

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 font-sans">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-gray-800 p-3 gap-1">
        <h1 className="text-xs font-semibold uppercase tracking-widest text-gray-500 px-2 mb-2">
          2 Do Better
        </h1>

        {lists.map((list) => (
          <div key={list.id} className="group relative">
            {editingListId === list.id ? (
              <input
                className="w-full rounded px-2 py-1 bg-gray-800 text-sm text-gray-100 outline-none"
                value={editingListName}
                autoFocus
                onChange={(e) => setEditingListName(e.target.value)}
                onBlur={() => saveListName(list.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveListName(list.id);
                  if (e.key === "Escape") setEditingListId(null);
                }}
              />
            ) : (
              <button
                onClick={() => setSelectedListId(list.id)}
                onDoubleClick={() => {
                  setEditingListId(list.id);
                  setEditingListName(list.name);
                }}
                className={`w-full text-left rounded px-2 py-1.5 text-sm flex justify-between items-center transition-colors ${
                  selectedListId === list.id
                    ? "bg-blue-600 text-white"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <span className="truncate">{list.name}</span>
                {list._count.tasks > 0 && (
                  <span className="text-xs opacity-60 ml-1 flex-shrink-0">
                    {list._count.tasks}
                  </span>
                )}
              </button>
            )}
            {editingListId !== list.id && (
              <button
                onClick={() => deleteList(list.id)}
                className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center justify-center w-5 h-5 rounded text-gray-500 hover:text-red-400 hover:bg-gray-700 text-xs"
                title="Delete list"
              >
                ×
              </button>
            )}
          </div>
        ))}

        <form
          onSubmit={createList}
          className="mt-auto pt-3 border-t border-gray-800"
        >
          <input
            className="w-full rounded px-2 py-1.5 bg-gray-800 text-sm text-gray-300 placeholder-gray-600 outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="+ New list"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
          />
        </form>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 p-6">
        {selectedList ? (
          <>
            <h2 className="text-xl font-semibold text-gray-100 mb-4">
              {selectedList.name}
            </h2>

            <form onSubmit={createTask} className="mb-6">
              <input
                ref={taskInputRef}
                className="w-full max-w-xl rounded px-3 py-2 bg-gray-800 text-gray-100 placeholder-gray-600 outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                placeholder="Add a task…"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
            </form>

            <div className="space-y-1 max-w-xl">
              {activeTasks.length === 0 && completedTasks.length === 0 && (
                <p className="text-sm text-gray-600">No tasks yet.</p>
              )}

              {activeTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isEditing={editingTaskId === task.id}
                  editValue={editingTaskTitle}
                  onToggle={() => toggleTask(task)}
                  onDelete={() => deleteTask(task.id)}
                  onStartEdit={() => {
                    setEditingTaskId(task.id);
                    setEditingTaskTitle(task.title);
                  }}
                  onEditChange={setEditingTaskTitle}
                  onEditSave={() => saveTaskTitle(task.id)}
                  onEditCancel={() => setEditingTaskId(null)}
                />
              ))}

              {sortedGroupKeys.map((dateKey) => (
                <div key={dateKey} className="mt-6">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-600 mb-2 px-1">
                    Completed — {dateKey}
                  </p>
                  <div className="space-y-1">
                    {completedGroups[dateKey].map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        isEditing={editingTaskId === task.id}
                        editValue={editingTaskTitle}
                        onToggle={() => toggleTask(task)}
                        onDelete={() => deleteTask(task.id)}
                        onStartEdit={() => {
                          setEditingTaskId(task.id);
                          setEditingTaskTitle(task.title);
                        }}
                        onEditChange={setEditingTaskTitle}
                        onEditSave={() => saveTaskTitle(task.id)}
                        onEditCancel={() => setEditingTaskId(null)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-600 text-sm">
              Create a list to get started.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

type TaskRowProps = {
  task: Task;
  isEditing: boolean;
  editValue: string;
  onToggle: () => void;
  onDelete: () => void;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
};

function TaskRow({
  task,
  isEditing,
  editValue,
  onToggle,
  onDelete,
  onStartEdit,
  onEditChange,
  onEditSave,
  onEditCancel,
}: TaskRowProps) {
  return (
    <div
      className={`group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-800 transition-colors ${
        task.completed ? "opacity-40" : ""
      }`}
    >
      <button
        onClick={onToggle}
        className={`flex-shrink-0 w-4 h-4 rounded border transition-colors flex items-center justify-center ${
          task.completed
            ? "bg-gray-500 border-gray-500"
            : "border-gray-600 hover:border-blue-400"
        }`}
        title={task.completed ? "Reinstate task" : "Complete task"}
      >
        {task.completed && (
          <svg
            viewBox="0 0 10 10"
            className="w-3 h-3 text-gray-200"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1.5 5 L4 7.5 L8.5 2.5" />
          </svg>
        )}
      </button>

      {isEditing ? (
        <input
          className="flex-1 bg-transparent outline-none text-sm text-gray-100 border-b border-blue-500"
          value={editValue}
          autoFocus
          onChange={(e) => onEditChange(e.target.value)}
          onBlur={onEditSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEditSave();
            if (e.key === "Escape") onEditCancel();
          }}
        />
      ) : (
        <span
          onDoubleClick={onStartEdit}
          className={`flex-1 text-sm select-none cursor-default ${
            task.completed ? "line-through text-gray-400" : "text-gray-200"
          }`}
        >
          {task.title}
        </span>
      )}

      {!isEditing && (
        <button
          onClick={onDelete}
          className="hidden group-hover:block text-gray-600 hover:text-red-400 text-xs ml-1 flex-shrink-0"
          title="Delete task"
        >
          ×
        </button>
      )}
    </div>
  );
}
