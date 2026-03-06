"use client";

import { useCallback, useEffect, useState } from "react";
import { BoardData } from "./types";
import ColumnPanel from "./components/ColumnPanel";

export default function Home() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [offline, setOffline] = useState(false);

  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch("/api/overview");
      if (res.status === 401) {
        // Auth cookie expired — navigate to login (reload would loop)
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        setOffline(true);
        return;
      }
      const data: BoardData = await res.json();
      setOffline(false);
      if (data.columns.length === 0) {
        await fetch("/api/seed", { method: "POST" });
        const res2 = await fetch("/api/overview");
        const data2 = await res2.json();
        setBoard(data2);
      } else {
        setBoard(data);
      }
    } catch {
      // Network error — server unreachable
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // Retry when the device comes back online
  useEffect(() => {
    window.addEventListener("online", fetchBoard);
    return () => window.removeEventListener("online", fetchBoard);
  }, [fetchBoard]);

  // Real-time sync: listen for server-sent events from other clients
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = () => {
      fetchBoard();
    };
    es.onerror = () => {
      // EventSource auto-reconnects — no action needed
    };
    return () => es.close();
  }, [fetchBoard]);

  if (offline) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-screen bg-gray-950 text-gray-500">
        <div className="text-sm">Server unreachable</div>
        <button
          onClick={fetchBoard}
          className="px-3 py-1.5 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

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
          Each column targets 1/3 viewport width on desktop. With flex-1 +
          min-w-[33vw]: 1-2 columns fill the screen evenly, 3 columns sit at
          exactly 1/3 each, 4+ overflow and scroll horizontally. */}
      <div className="flex-1 flex flex-col md:flex-row md:min-h-0 overflow-y-auto md:overflow-x-auto md:overflow-y-hidden">
        {board.columns.map((col, i) => (
          <div
            key={col.id}
            className={`flex flex-col md:min-h-0 md:flex-1 md:min-w-[33vw] ${
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
