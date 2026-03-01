"use client";

import { useRef, useState } from "react";
import { ListData, Task } from "../types";
import TaskRow from "./TaskRow";

type ListCardProps = {
  list: ListData;
  onRefresh: () => void;
};

export default function ListCard({ list, onRefresh }: ListCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newSubListName, setNewSubListName] = useState("");
  const [showAddSubList, setShowAddSubList] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(list.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const taskInputRef = useRef<HTMLInputElement>(null);

  const activeTasks = list.tasks.filter((t) => !t.completed);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    await fetch(`/api/lists/${list.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTaskTitle }),
    });
    setNewTaskTitle("");
    onRefresh();
    taskInputRef.current?.focus();
  }

  async function toggleTask(task: Task) {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !task.completed }),
    });
    onRefresh();
  }

  async function deleteTask(id: number) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    onRefresh();
  }

  async function saveTaskTitle(id: number, title: string) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    onRefresh();
  }

  async function saveListName() {
    if (!nameValue.trim()) return;
    await fetch(`/api/lists/${list.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue.trim() }),
    });
    setEditingName(false);
    onRefresh();
  }

  async function deleteList() {
    await fetch(`/api/lists/${list.id}`, { method: "DELETE" });
    setConfirmDelete(false);
    onRefresh();
  }

  async function createSubList(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubListName.trim()) return;
    await fetch(`/api/lists/${list.id}/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSubListName }),
    });
    setNewSubListName("");
    setShowAddSubList(false);
    onRefresh();
  }

  return (
    <div className="rounded-lg bg-gray-900/50 border border-gray-800/50">
      {/* List header */}
      <div className="group flex items-center gap-1 px-3 py-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-shrink-0 text-gray-500 hover:text-gray-300"
        >
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {editingName ? (
          <input
            className="flex-1 bg-transparent outline-none text-sm font-medium text-gray-100 border-b border-blue-500"
            value={nameValue}
            autoFocus
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={saveListName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveListName();
              if (e.key === "Escape") setEditingName(false);
            }}
          />
        ) : confirmDelete ? (
          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs text-red-300">Delete list?</span>
            <button
              onClick={deleteList}
              className="text-xs px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
            >
              No
            </button>
          </div>
        ) : (
          <span
            onDoubleClick={() => {
              setEditingName(true);
              setNameValue(list.name);
            }}
            className="flex-1 text-sm font-medium text-gray-300 select-none cursor-default"
          >
            {list.name}
          </span>
        )}

        {!editingName && !confirmDelete && (
          <div className="hidden group-hover:flex items-center gap-1">
            <button
              onClick={() => setShowAddSubList(!showAddSubList)}
              className="text-gray-600 hover:text-gray-400 text-xs px-1"
              title="Add sub-list"
            >
              +
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-gray-600 hover:text-red-400 text-xs px-1"
              title="Delete list"
            >
              ×
            </button>
          </div>
        )}

        {activeTasks.length > 0 && !editingName && !confirmDelete && (
          <span className="text-xs text-gray-600 flex-shrink-0">
            {activeTasks.length}
          </span>
        )}
      </div>

      {/* List content */}
      {isExpanded && (
        <div className="px-1 pb-2">
          {/* Tasks */}
          <div className="space-y-0">
            {activeTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={toggleTask}
                onDelete={deleteTask}
                onSave={saveTaskTitle}
              />
            ))}
          </div>

          {/* Add task input */}
          <form onSubmit={createTask} className="px-2 mt-1">
            <input
              ref={taskInputRef}
              className="w-full rounded px-2 py-1 bg-transparent text-sm text-gray-400 placeholder-gray-700 outline-none focus:bg-gray-800/50 focus:placeholder-gray-600 transition-colors"
              placeholder="+ Add task"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
            />
          </form>

          {/* Sub-list creation form */}
          {showAddSubList && (
            <form onSubmit={createSubList} className="px-2 mt-2">
              <input
                className="w-full rounded px-2 py-1 bg-gray-800 text-sm text-gray-300 placeholder-gray-600 outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Sub-list name..."
                value={newSubListName}
                autoFocus
                onChange={(e) => setNewSubListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowAddSubList(false);
                    setNewSubListName("");
                  }
                }}
              />
            </form>
          )}

          {/* Sub-lists */}
          {list.children.map((child) => (
            <div
              key={child.id}
              className="ml-3 mt-2 border-l-2 border-gray-800 pl-2"
            >
              <SubList list={child} onRefresh={onRefresh} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* Sub-list component (no further nesting allowed) */
function SubList({
  list,
  onRefresh,
}: {
  list: ListData;
  onRefresh: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(list.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeTasks = list.tasks.filter((t) => !t.completed);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    await fetch(`/api/lists/${list.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTaskTitle }),
    });
    setNewTaskTitle("");
    onRefresh();
  }

  async function toggleTask(task: Task) {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !task.completed }),
    });
    onRefresh();
  }

  async function deleteTask(id: number) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    onRefresh();
  }

  async function saveTaskTitle(id: number, title: string) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    onRefresh();
  }

  async function saveListName() {
    if (!nameValue.trim()) return;
    await fetch(`/api/lists/${list.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameValue.trim() }),
    });
    setEditingName(false);
    onRefresh();
  }

  async function deleteSubList() {
    await fetch(`/api/lists/${list.id}`, { method: "DELETE" });
    setConfirmDelete(false);
    onRefresh();
  }

  return (
    <div>
      <div className="group flex items-center gap-1 py-1">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex-shrink-0 text-gray-600 hover:text-gray-400"
        >
          <svg
            className={`w-2.5 h-2.5 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {editingName ? (
          <input
            className="flex-1 bg-transparent outline-none text-xs font-medium text-gray-100 border-b border-blue-500"
            value={nameValue}
            autoFocus
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={saveListName}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveListName();
              if (e.key === "Escape") setEditingName(false);
            }}
          />
        ) : confirmDelete ? (
          <div className="flex-1 flex items-center gap-2">
            <span className="text-xs text-red-300">Delete?</span>
            <button
              onClick={deleteSubList}
              className="text-xs px-1 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs px-1 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
            >
              No
            </button>
          </div>
        ) : (
          <span
            onDoubleClick={() => {
              setEditingName(true);
              setNameValue(list.name);
            }}
            className="flex-1 text-xs font-medium text-gray-400 select-none cursor-default"
          >
            {list.name}
          </span>
        )}

        {!editingName && !confirmDelete && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="hidden group-hover:block text-gray-700 hover:text-red-400 text-xs px-1"
            title="Delete sub-list"
          >
            ×
          </button>
        )}

        {activeTasks.length > 0 && !editingName && !confirmDelete && (
          <span className="text-xs text-gray-700 flex-shrink-0">
            {activeTasks.length}
          </span>
        )}
      </div>

      {isExpanded && (
        <div>
          {activeTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={toggleTask}
              onDelete={deleteTask}
              onSave={saveTaskTitle}
            />
          ))}
          <form onSubmit={createTask} className="px-2 mt-0.5">
            <input
              className="w-full rounded px-2 py-0.5 bg-transparent text-xs text-gray-500 placeholder-gray-700 outline-none focus:bg-gray-800/50 transition-colors"
              placeholder="+ Add task"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
            />
          </form>
        </div>
      )}
    </div>
  );
}
