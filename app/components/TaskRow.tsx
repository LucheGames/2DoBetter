"use client";

import { useState } from "react";
import { Task } from "../types";

type TaskRowProps = {
  task: Task;
  onToggle: (task: Task) => void;
  onSave: (id: number, title: string) => void;
  showBreadcrumb?: boolean;
  dragHandle?: React.ReactNode;
  moveButton?: React.ReactNode;
  activeSpinner?: boolean;
};

export default function TaskRow({
  task,
  onToggle,
  onSave,
  showBreadcrumb,
  dragHandle,
  moveButton,
  activeSpinner,
}: TaskRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.title);

  function handleSave() {
    if (editValue.trim()) {
      onSave(task.id, editValue.trim());
    }
    setIsEditing(false);
  }

  return (
    <div
      className={`group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-800/50 transition-all duration-200 ${
        task.completed ? "opacity-40" : ""
      }`}
    >
      {dragHandle}

      {/* Checkbox or active spinner */}
      {activeSpinner ? (
        <span className="flex-shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center" title="Claude is working…">
          <svg className="w-4 h-4 text-pink-400 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </span>
      ) : (
        <button
          onClick={() => onToggle(task)}
          className="flex-shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center"
          title={task.completed ? "Reinstate task" : "Complete task"}
        >
          <span className={`w-4 h-4 rounded border transition-all duration-200 flex items-center justify-center ${
            task.completed
              ? "bg-accent-500 border-accent-500"
              : "border-gray-600 hover:border-accent-400 hover:bg-accent-400/10"
          }`}>
            <svg
              viewBox="0 0 10 10"
              className={`w-3 h-3 text-white transition-all duration-200 ${
                task.completed ? "opacity-100 scale-100" : "opacity-0 scale-50"
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1.5 5 L4 7.5 L8.5 2.5" />
            </svg>
          </span>
        </button>
      )}

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <textarea
            className="w-full bg-transparent outline-none app-task-text text-gray-100 border-b border-accent-500 resize-none overflow-hidden"
            value={editValue}
            rows={1}
            autoFocus
            onChange={(e) => {
              setEditValue(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            onFocus={(e) => {
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); }
              if (e.key === "Escape") setIsEditing(false);
            }}
          />
        ) : (
          <div>
            <span
              onClick={() => {
                setIsEditing(true);
                setEditValue(task.title);
              }}
              className={`app-task-text select-none cursor-pointer transition-all duration-200 whitespace-pre-wrap break-words ${
                task.completed ? "line-through text-gray-400" : "text-gray-200"
              }`}
            >
              {task.title}
            </span>
            {showBreadcrumb && task.completedBreadcrumb && (
              <span className="app-meta text-gray-600 ml-2">
                {task.completedBreadcrumb}
              </span>
            )}
            {task.createdBy && (
              <span className="app-meta text-gray-700 ml-1">↑ {task.createdBy}</span>
            )}
          </div>
        )}
      </div>

      {/* Action buttons — hidden until hover on desktop, always visible on touch */}
      {!isEditing && moveButton && (
        <div className="hidden group-hover:flex [@media(pointer:coarse)]:flex items-center flex-shrink-0">
          {moveButton}
        </div>
      )}
    </div>
  );
}
