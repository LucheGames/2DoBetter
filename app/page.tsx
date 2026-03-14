"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
    // Within non-own: agent columns before teammate columns
    const aAgent = a.isAgent ? 0 : 1;
    const bAgent = b.isAgent ? 0 : 1;
    if (aAgent !== bAgent) return aAgent - bAgent;
    return a.order - b.order;
  });
}

// ── Create Agent modal ────────────────────────────────────────────────────────
function CreateAgentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [token, setToken]       = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);
  const inputRef                = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 0); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName: name.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.agentToken);
        onCreated();
      } else {
        setError(data.error ?? "Something went wrong.");
      }
    } catch {
      setError("Connection failed.");
    } finally {
      setLoading(false);
    }
  }

  function copyToken() {
    if (!token) return;
    navigator.clipboard.writeText(token).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">New agent</h2>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors" style={{ cursor: "pointer" }}>
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {token ? (
          <div className="space-y-3">
            <p className="text-xs text-green-400">Agent created! Copy the token below — you won't see it again.</p>
            <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 space-y-2">
              <p className="text-xs text-gray-300 break-all font-mono leading-relaxed">{token}</p>
              <div className="flex justify-end">
                <button
                  onClick={copyToken}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
                  style={{ cursor: "pointer" }}
                >
                  {copied ? "Copied ✓" : "Copy token"}
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-600">Use this token as the MCP agent token in your AI client config.</p>
            <button
              onClick={onClose}
              className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
              style={{ cursor: "pointer" }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              ref={inputRef}
              type="text"
              placeholder="Agent name (e.g. Jarvis)"
              value={name}
              onChange={e => { setName(e.target.value); setError(""); }}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm rounded-lg transition-colors"
              style={{ cursor: loading || !name.trim() ? "default" : "pointer" }}
            >
              {loading ? "Creating…" : "Create agent"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [offline, setOffline] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
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
          {/* + Agent button — visible to all non-agent users */}
          {board.currentUser && !board.isAgent && (
            <button
              onClick={() => setShowCreateAgent(true)}
              title="Create a new AI agent"
              className="app-ui-text text-gray-600 hover:text-gray-300 transition-colors select-none"
              style={{ cursor: "pointer" }}
            >
              + Agent
            </button>
          )}

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

      {/* Create agent modal */}
      {showCreateAgent && (
        <CreateAgentModal
          onClose={() => setShowCreateAgent(false)}
          onCreated={fetchBoard}
        />
      )}

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
