"use client";

import { useEffect, useRef, useState } from "react";
import { ColumnData } from "../types";

type MoveTaskMenuProps = {
  currentListId: number;
  onMove: (targetListId: number) => void;
};

type MoveProjectMenuProps = {
  currentColumnId: number;
  onMove: (targetColumnId: number) => void;
};

function ArrowIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

/** Shared dropdown shell — positions itself above/below trigger to stay on screen */
function Dropdown({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 bottom-full mb-1 z-50 w-52 rounded-lg bg-gray-900 border border-gray-700 shadow-xl overflow-hidden"
    >
      {children}
    </div>
  );
}

/** Move a task to a different list (across any column) */
export function MoveTaskButton({ currentListId, onMove }: MoveTaskMenuProps) {
  const [open, setOpen] = useState(false);
  const [columns, setColumns] = useState<ColumnData[]>([]);

  async function load() {
    const res = await fetch("/api/overview");
    const data = await res.json();
    setColumns(data.columns ?? []);
  }

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open) load();
    setOpen((v) => !v);
  }

  return (
    <span className="relative inline-flex">
      <button
        onClick={toggle}
        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-500 hover:text-accent-400 transition-colors rounded"
        title="Move to…"
      >
        <ArrowIcon />
      </button>

      {open && (
        <Dropdown onClose={() => setOpen(false)}>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 px-3 pt-2.5 pb-1">
            Move task to…
          </p>
          <div className="max-h-64 overflow-y-auto pb-1">
            {columns.map((col) => (
              <div key={col.id}>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wider px-3 pt-2 pb-0.5">
                  {col.name}
                </p>
                {col.lists.map((list) => {
                  const isCurrent = list.id === currentListId;
                  return (
                    <button
                      key={list.id}
                      disabled={isCurrent}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMove(list.id);
                        setOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                        isCurrent
                          ? "text-gray-600 cursor-default"
                          : "text-gray-300 hover:bg-gray-800 hover:text-white"
                      }`}
                    >
                      {isCurrent ? `${list.name} ✓` : list.name}
                    </button>
                  );
                })}
              </div>
            ))}
            {columns.length === 0 && (
              <p className="text-xs text-gray-600 px-3 py-2">Loading…</p>
            )}
          </div>
        </Dropdown>
      )}
    </span>
  );
}

/** Move a project (list) to a different column */
export function MoveProjectButton({ currentColumnId, onMove }: MoveProjectMenuProps) {
  const [open, setOpen] = useState(false);
  const [columns, setColumns] = useState<ColumnData[]>([]);

  async function load() {
    const res = await fetch("/api/overview");
    const data = await res.json();
    setColumns(data.columns ?? []);
  }

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open) load();
    setOpen((v) => !v);
  }

  return (
    <span className="relative inline-flex">
      <button
        onClick={toggle}
        className="min-w-[36px] min-h-[36px] flex items-center justify-center text-gray-500 hover:text-accent-400 transition-colors rounded"
        title="Move project to…"
      >
        <ArrowIcon />
      </button>

      {open && (
        <Dropdown onClose={() => setOpen(false)}>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 px-3 pt-2.5 pb-1">
            Move project to…
          </p>
          <div className="pb-1">
            {columns.map((col) => {
              const isCurrent = col.id === currentColumnId;
              return (
                <button
                  key={col.id}
                  disabled={isCurrent}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMove(col.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    isCurrent
                      ? "text-gray-600 cursor-default"
                      : "text-gray-300 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  {isCurrent ? `${col.name} ✓` : col.name}
                </button>
              );
            })}
            {columns.length === 0 && (
              <p className="text-xs text-gray-600 px-3 py-2">Loading…</p>
            )}
          </div>
        </Dropdown>
      )}
    </span>
  );
}
