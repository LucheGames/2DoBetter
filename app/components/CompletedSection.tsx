"use client";

import { useState } from "react";
import { ListData, Task } from "../types";
import TaskRow from "./TaskRow";

type CompletedSectionProps = {
  lists: ListData[];
  onRefresh: () => void;
};

function getAllCompletedTasks(lists: ListData[]): Task[] {
  const tasks: Task[] = [];
  for (const list of lists) {
    tasks.push(...list.tasks.filter((t) => t.completed));
  }
  return tasks.sort((a, b) => {
    const dateA = a.completedAt ?? "";
    const dateB = b.completedAt ?? "";
    return dateB.localeCompare(dateA);
  });
}

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

export default function CompletedSection({
  lists,
  onRefresh,
}: CompletedSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const completedTasks = getAllCompletedTasks(lists);
  if (completedTasks.length === 0) return null;

  const groups = groupByDate(completedTasks);
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    const dateA = groups[a][0]?.completedAt ?? "";
    const dateB = groups[b][0]?.completedAt ?? "";
    return dateB.localeCompare(dateA);
  });

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

  return (
    <div className="mt-4 pt-3 border-t border-gray-800/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-600 hover:text-gray-400 transition-colors px-1 py-1"
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
        Completed ({completedTasks.length})
      </button>

      {isOpen && (
        <div className="mt-2 space-y-3">
          {sortedKeys.map((dateKey) => (
            <div key={dateKey}>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-700 mb-1 px-1">
                {dateKey}
              </p>
              <div className="space-y-0">
                {groups[dateKey].map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={toggleTask}
                    onDelete={deleteTask}
                    onSave={saveTaskTitle}
                    showBreadcrumb
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
