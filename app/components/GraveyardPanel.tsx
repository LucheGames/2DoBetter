"use client";

import { useEffect, useRef, useState } from "react";
import { ListData, Task } from "../types";
import HoldToDelete from "./HoldToDelete";

type GraveyardPanelProps = {
  columnId: number;
  onResurrect: () => void; // called after a project is resurrected (triggers board refresh)
};

function SkullIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a9 9 0 0 0-9 9c0 3.18 1.65 5.97 4.13 7.57L7 20a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l-.13-1.43A9 9 0 0 0 12 2zm-2.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
    </svg>
  );
}

export default function GraveyardPanel({ columnId, onResurrect }: GraveyardPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [archived, setArchived] = useState<ListData[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/graveyard?columnId=${columnId}`);
      const data = await res.json();
      setArchived(data.archived ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      load();
      // Give the DOM a tick to render the expanded content, then scroll into view
      setTimeout(() => {
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }, [isOpen]);

  async function resurrect(id: number) {
    await fetch(`/api/graveyard/${id}/resurrect`, { method: "POST" });
    await load();
    onResurrect();
  }

  async function hardDelete(id: number) {
    await fetch(`/api/lists/${id}`, { method: "DELETE" });
    await load();
  }

  // Uncompleting a task from the graveyard: resurrects the project automatically via the API
  async function uncompleteTask(task: Task) {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: false }),
    });
    await load();
    onResurrect();
  }

  const totalArchived = archived.length;

  return (
    <div ref={panelRef} className="mt-4 pt-3 border-t border-gray-800/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-600 hover:text-gray-400 transition-colors px-1 py-1 w-full"
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-90" : ""}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
        <SkullIcon />
        <span>Graveyard{totalArchived > 0 ? ` (${totalArchived})` : ""}</span>
      </button>

      {isOpen && (
        <div className="mt-2 space-y-2">
          {loading && (
            <p className="text-xs text-gray-600 px-1">Loading...</p>
          )}

          {!loading && archived.length === 0 && (
            <p className="text-xs text-gray-700 px-1 py-2 text-center">No archived projects.</p>
          )}

          {archived.map((project) => {
            const allTasks: Task[] = [...project.tasks];
            const activeTasks = allTasks.filter((t) => !t.completed);
            const completedTasks = allTasks.filter((t) => t.completed);
            const archivedDate = project.archivedAt
              ? new Date(project.archivedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : null;

            return (
              <div
                key={project.id}
                className="rounded-lg bg-gray-900/30 border border-gray-800/30 px-3 py-2 opacity-70"
              >
                {/* Project header */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="flex-1 text-sm font-medium text-gray-400 line-through">
                    {project.name}
                  </span>
                  {archivedDate && (
                    <span className="text-xs text-gray-700 flex-shrink-0">{archivedDate}</span>
                  )}
                  {/* Resurrect button */}
                  <button
                    onClick={() => resurrect(project.id)}
                    className="text-xs text-gray-600 hover:text-green-400 transition-colors px-1 flex-shrink-0"
                    title="Resurrect project"
                  >
                    ↑
                  </button>
                  {/* Permanently delete */}
                  <HoldToDelete
                    onConfirm={() => hardDelete(project.id)}
                    label="Permanently delete?"
                    className="flex-shrink-0"
                  />
                </div>

                {/* Active (incomplete) tasks — greyed, just shown for context */}
                {activeTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-2 py-0.5 pl-1">
                    <span className="w-3 h-3 rounded border border-gray-700 flex-shrink-0" />
                    <span className="text-xs text-gray-600 flex-1 truncate">{task.title}</span>
                  </div>
                ))}

                {/* Completed tasks — unchecking one will resurrect the project */}
                {completedTasks.map((task) => (
                  <div key={task.id} className="group flex items-center gap-2 py-0.5 pl-1">
                    <button
                      onClick={() => uncompleteTask(task)}
                      className="w-3 h-3 rounded border border-accent-700 bg-accent-800/50 flex-shrink-0 flex items-center justify-center hover:bg-accent-600 transition-colors"
                      title="Uncheck to resurrect project"
                    >
                      <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 text-accent-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1.5 5 L4 7.5 L8.5 2.5" />
                      </svg>
                    </button>
                    <span className="text-xs text-gray-600 line-through flex-1 truncate">{task.title}</span>
                  </div>
                ))}

                {allTasks.length === 0 && (
                  <p className="text-xs text-gray-700 pl-1">No tasks</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
