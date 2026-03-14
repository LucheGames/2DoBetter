"use client";

import { useCallback, useEffect, useState } from "react";
import { BoardData, ColumnData } from "./types";
import ColumnPanel from "./components/ColumnPanel";
import AdminPanel from "./components/AdminPanel";

/** Sort columns: own column → agent/unowned → teammates (by order). */
function sortColumns(columns: ColumnData[], currentUser: string | null): ColumnData[] {
  if (!currentUser) return columns;
  return [...columns].sort((a, b) => {
    const aOwn = a.ownerUsername === currentUser ? 0 : 1;
    const bOwn = b.ownerUsername === currentUser ? 0 : 1;
    if (aOwn !== bOwn) return aOwn - bOwn;
    // Within non-own: unowned (agent) columns before other users
    const aAgent = !a.ownerUsername ? 0 : 1;
    const bAgent = !b.ownerUsername ? 0 : 1;
    if (aAgent !== bAgent) return aAgent - bAgent;
    return a.order - b.order;
  });
}

export default function Home() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [offline, setOffline] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [collapsedCols, setCollapsedCols] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem("2db-collapsed");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  function toggleCollapse(colId: number) {
    setCollapsedCols(prev => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      localStorage.setItem("2db-collapsed", JSON.stringify([...next]));
      return next;
    });
  }

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
        const data2: BoardData = await res2.json();
        data2.columns = sortColumns(data2.columns, data2.currentUser);
        setBoard(data2);
      } else {
        data.columns = sortColumns(data.columns, data.currentUser);
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

  // ── Sign out ───────────────────────────────────────────────────────────────
  const handleSignOut = useCallback(async () => {
    // POST clears cookies server-side; then navigate using a relative path so
    // we never depend on the server building a correct absolute redirect URL
    // (which breaks on mobile when Next.js uses localhost internally).
    // replace() instead of href so the board isn't in the back-stack post-logout.
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    window.location.replace("/login");
  }, []);

  // Real-time sync: listen for server-sent events from other clients
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === "reload") { window.location.reload(); return; }
      } catch { /* non-JSON keepalive comments — ignore */ }
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
        <div className="flex items-center gap-2">
          <a
            href="https://www.buymeacoffee.com/luchegames"
            target="_blank"
            rel="noopener noreferrer"
            title="Support development ☕"
            className="app-logo app-ui-text font-semibold uppercase tracking-widest hover:text-gray-300 transition-colors select-none relative top-[2px]"
          >
            2Do Better
          </a>
          <a
            href="https://www.buymeacoffee.com/luchegames"
            target="_blank"
            rel="noopener noreferrer"
            title="Support development ☕"
            className="text-base leading-none text-gray-700 hover:text-yellow-400 transition-colors duration-200 select-none"
          >
            ☕
          </a>
        </div>

        <div className="flex items-center gap-4">
          {/* Admin panel button — admin only */}
          {board.isAdmin && (
            <button
              onClick={() => setShowAdmin(true)}
              title="Admin panel"
              className="text-gray-600 hover:text-gray-300 transition-colors"
              style={{ cursor: "pointer" }}
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="2" />
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
              </svg>
            </button>
          )}

          {/* Signed-in user + sign out */}
          {board.currentUser && (
            <div className="flex items-center gap-2 border-l border-gray-800 pl-4">
              <span className="app-ui-text select-none">{board.currentUser}</span>
              <button
                onClick={handleSignOut}
                title="Sign out"
                className="app-ui-text hover:text-gray-200 transition-colors select-none"
              >
                sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Admin panel modal */}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} onDataChanged={fetchBoard} />}

      {/* Columns — side by side on desktop, stacked on mobile.
          1–3 visible columns: min-w-[33vw] fills screen evenly.
          4+ visible columns: min-w-[30vw] so the 4th peeks ~10% on the right,
          hinting that horizontal scroll is available. */}
      <div className="flex-1 flex flex-col md:flex-row md:min-h-0 overflow-y-auto md:overflow-x-auto md:overflow-y-hidden">
        {(() => {
          const visibleCount = board.columns.filter(c => !collapsedCols.has(c.id)).length;
          const colMinW = visibleCount >= 4 ? "md:min-w-[30vw]" : "md:min-w-[33vw]";
          return board.columns.map((col, i) => {
          const isCollapsed = collapsedCols.has(col.id);
          return (
            <div
              key={col.id}
              className={`flex flex-col md:min-h-0 transition-[width,flex] duration-200 ${
                isCollapsed ? "md:flex-none md:w-12" : `md:flex-1 ${colMinW}`
              } ${
                i < board.columns.length - 1
                  ? "border-b md:border-b-0 md:border-r border-gray-800"
                  : ""
              }`}
            >
              <ColumnPanel
                column={col}
                currentUser={board.currentUser}
                isAdmin={board.isAdmin}
                onRefresh={fetchBoard}
                collapsed={isCollapsed}
                onToggleCollapse={() => toggleCollapse(col.id)}
              />
            </div>
          );
        });
        })()}
      </div>
    </div>
  );
}
