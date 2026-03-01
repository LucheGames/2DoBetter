"use client";

import { useCallback, useEffect, useState } from "react";
import { BoardData } from "./types";
import ColumnPanel from "./components/ColumnPanel";

export default function Home() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeTab, setActiveTab] = useState<number>(0);

  const fetchBoard = useCallback(async () => {
    const res = await fetch("/api/overview");
    const data: BoardData = await res.json();
    if (data.columns.length === 0) {
      await fetch("/api/seed", { method: "POST" });
      const res2 = await fetch("/api/overview");
      const data2 = await res2.json();
      setBoard(data2);
    } else {
      setBoard(data);
    }
  }, []);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  if (!board) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950 text-gray-600">
        <div className="text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 font-sans">
      {/* Top bar */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <h1 className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          2 Do Better
        </h1>
      </header>

      {/* Mobile tab switcher (visible < md) */}
      <div className="flex-shrink-0 md:hidden flex border-b border-gray-800">
        {board.columns.map((col, i) => (
          <button
            key={col.id}
            onClick={() => setActiveTab(i)}
            className={`flex-1 py-2 text-sm font-medium text-center transition-colors ${
              activeTab === i
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {col.name}
          </button>
        ))}
      </div>

      {/* Columns */}
      <div className="flex-1 flex min-h-0">
        {board.columns.map((col, i) => (
          <div
            key={col.id}
            className={`flex-1 flex flex-col min-w-0 ${
              i < board.columns.length - 1 ? "border-r border-gray-800" : ""
            } ${i === activeTab ? "" : "hidden md:flex"}`}
          >
            <ColumnPanel column={col} onRefresh={fetchBoard} />
          </div>
        ))}
      </div>
    </div>
  );
}
