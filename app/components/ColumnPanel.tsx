"use client";

import { useState } from "react";
import { ColumnData } from "../types";
import ListCard from "./ListCard";
import CompletedSection from "./CompletedSection";

type ColumnPanelProps = {
  column: ColumnData;
  onRefresh: () => void;
};

export default function ColumnPanel({ column, onRefresh }: ColumnPanelProps) {
  const [newListName, setNewListName] = useState("");

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    if (!newListName.trim()) return;
    await fetch(`/api/columns/${column.id}/lists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newListName }),
    });
    setNewListName("");
    onRefresh();
  }

  const hasAnyContent =
    column.lists.length > 0 ||
    column.lists.some((l) => l.tasks.length > 0 || l.children.length > 0);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Column header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-200">
            {column.name}
          </h2>
          <span className="text-xs text-gray-600 uppercase tracking-wider">
            {column.slug === "dave" ? "Principal" : "Agent"}
          </span>
        </div>
      </div>

      {/* Column content — scrollable */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {column.lists.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-600">
            <svg
              className="w-10 h-10 mb-2 opacity-20"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p className="text-xs">No lists yet</p>
          </div>
        )}

        {column.lists.map((list) => (
          <ListCard key={list.id} list={list} onRefresh={onRefresh} />
        ))}

        {/* New list form */}
        <form onSubmit={createList}>
          <input
            className="w-full rounded-lg px-3 py-2 bg-gray-900/30 border border-gray-800/30 text-sm text-gray-400 placeholder-gray-700 outline-none focus:bg-gray-900/50 focus:border-gray-700 focus:placeholder-gray-600 transition-all"
            placeholder="+ New list"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
          />
        </form>

        {/* Completed section */}
        <CompletedSection lists={column.lists} onRefresh={onRefresh} />
      </div>
    </div>
  );
}
