"use client";

import { useCallback, useEffect, useState } from "react";
import { BoardData } from "./types";
import ColumnPanel from "./components/ColumnPanel";

export default function Home() {
  const [board, setBoard] = useState<BoardData | null>(null);

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

      {/* Columns — side by side on desktop, stacked on mobile.
          Min width per column so many-agent boards scroll horizontally
          rather than squishing columns into unreadable slivers. */}
      <div className="flex-1 flex flex-col md:flex-row md:min-h-0 overflow-y-auto md:overflow-x-auto md:overflow-y-hidden">
        {board.columns.map((col, i) => (
          <div
            key={col.id}
            className={`flex flex-col md:min-h-0 md:flex-shrink-0 md:w-72 xl:flex-1 xl:min-w-72 ${
              i < board.columns.length - 1
                ? "border-b md:border-b-0 md:border-r border-gray-800"
                : ""
            }`}
          >
            <ColumnPanel column={col} onRefresh={fetchBoard} />
          </div>
        ))}
      </div>
    </div>
  );
}
