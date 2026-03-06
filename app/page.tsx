"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BoardData } from "./types";
import ColumnPanel from "./components/ColumnPanel";

export default function Home() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [offline, setOffline] = useState(false);
  const [importing, setImporting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

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

  // ── Import handler ────────────────────────────────────────────────────────
  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm(
      "⚠️ Import will REPLACE all current data with the contents of this file.\n\nThis cannot be undone. Continue?"
    )) {
      if (importRef.current) importRef.current.value = "";
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/import", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(json),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Import failed: ${err.error}`);
        return;
      }
      const { columns, lists, tasks } = await res.json();
      alert(`✓ Imported ${columns} column${columns !== 1 ? "s" : ""}, ${lists} list${lists !== 1 ? "s" : ""}, ${tasks} task${tasks !== 1 ? "s" : ""}.`);
      fetchBoard();
    } catch {
      alert("Import failed — make sure the file is a valid 2Do Better export.");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  }, [fetchBoard]);

  // ── Sign out ───────────────────────────────────────────────────────────────
  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }, []);

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

        <div className="flex items-center gap-4">
          {/* Export — direct link, browser sends auth cookie automatically */}
          <a
            href="/api/export"
            download
            title="Download your board as JSON"
            className="text-xs text-gray-600 hover:text-gray-300 transition-colors select-none"
          >
            ↓ export
          </a>

          {/* Import — hidden file input triggered by label */}
          <label
            title="Restore from a 2Do Better JSON export"
            className={`text-xs transition-colors select-none ${
              importing
                ? "text-gray-600 cursor-wait"
                : "text-gray-600 hover:text-gray-300 cursor-pointer"
            }`}
          >
            {importing ? "importing…" : "↑ import"}
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImport}
              disabled={importing}
            />
          </label>

          {/* Buy Me a Coffee */}
          <a
            href="https://www.buymeacoffee.com/luchegames"
            target="_blank"
            rel="noopener noreferrer"
            title="2Do Better is free — support development ☕"
            className="text-base leading-none text-gray-700 hover:text-yellow-400 transition-colors duration-200 select-none"
          >
            ☕
          </a>

          {/* Signed-in user + sign out */}
          {board.currentUser && (
            <div className="flex items-center gap-2 border-l border-gray-800 pl-4">
              <span className="text-xs text-gray-500 select-none">{board.currentUser}</span>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                title="Sign out"
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors select-none disabled:opacity-50"
                style={{ cursor: signingOut ? "wait" : "pointer" }}
              >
                {signingOut ? "…" : "sign out"}
              </button>
            </div>
          )}
        </div>
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
            <ColumnPanel column={col} currentUser={board.currentUser} onRefresh={fetchBoard} />
          </div>
        ))}
      </div>
    </div>
  );
}
