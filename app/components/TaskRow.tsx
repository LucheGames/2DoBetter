"use client";

import { useState } from "react";
import { Task } from "../types";

type TaskRowProps = {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (id: number) => void;
  onSave: (id: number, title: string) => void;
  showBreadcrumb?: boolean;
  dragHandle?: React.ReactNode;
};

export default function TaskRow({
  task,
  onToggle,
  onDelete,
  onSave,
  showBreadcrumb,
  dragHandle,
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
      className={`group flex items-start gap-2 rounded px-2 py-1.5 hover:bg-gray-800/50 transition-all duration-200 ${
        task.completed ? "opacity-40" : ""
      }`}
    >
      {dragHandle}

      <button
        onClick={() => onToggle(task)}
        className={`flex-shrink-0 w-4 h-4 mt-0.5 rounded border transition-all duration-200 flex items-center justify-center ${
          task.completed
            ? "bg-blue-500 border-blue-500"
            : "border-gray-600 hover:border-blue-400 hover:bg-blue-400/10"
        }`}
        title={task.completed ? "Reinstate task" : "Complete task"}
      >
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
      </button>

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <textarea
            className="w-full bg-transparent outline-none text-sm text-gray-100 border-b border-blue-500 resize-none overflow-hidden"
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
              onDoubleClick={() => {
                setIsEditing(true);
                setEditValue(task.title);
              }}
              className={`text-sm select-none cursor-default transition-all duration-200 whitespace-pre-wrap break-words ${
                task.completed ? "line-through text-gray-400" : "text-gray-200"
              }`}
            >
              {task.title}
            </span>
            {showBreadcrumb && task.completedBreadcrumb && (
              <span className="text-xs text-gray-600 ml-2">
                {task.completedBreadcrumb}
              </span>
            )}
          </div>
        )}
      </div>

      {!isEditing && (
        <button
          onClick={() => onDelete(task.id)}
          className="hidden group-hover:block text-gray-600 hover:text-red-400 text-xs ml-1 flex-shrink-0 mt-0.5"
          title="Delete task"
        >
          ×
        </button>
      )}
    </div>
  );
}
