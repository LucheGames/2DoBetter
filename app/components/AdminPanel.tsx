"use client";

import { useEffect, useState } from "react";

type AdminUser = {
  username: string;
  isAdmin: boolean;
  isAgent: boolean;
  readOnly: boolean;
  ownColumnOnly: boolean;
  columnName: string | null;
};

type AccessLevel = "full" | "ownColumn" | "readOnly";

function getAccessLevel(u: AdminUser): AccessLevel {
  if (u.readOnly)      return "readOnly";
  if (u.ownColumnOnly) return "ownColumn";
  return "full";
}

// ── Small reusable pill button ────────────────────────────────────────────────
function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
      }`}
      style={{ cursor: "pointer" }}
    >
      {children}
    </button>
  );
}

// ── Admin panel modal ─────────────────────────────────────────────────────────
export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [users,         setUsers]         = useState<AdminUser[]>([]);
  const [loadingUsers,  setLoadingUsers]  = useState(true);

  // Invite form
  const [inviteIsAgent,  setInviteIsAgent]  = useState(false);
  const [inviteAccess,   setInviteAccess]   = useState<AccessLevel>("ownColumn");
  const [inviteExpiry,   setInviteExpiry]   = useState(1440); // minutes — default 24 h
  const [inviteResult,   setInviteResult]   = useState<{ url: string; expiresAt: string } | null>(null);
  const [inviteLoading,  setInviteLoading]  = useState(false);
  const [copied,         setCopied]         = useState(false);

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function setAccess(username: string, level: AccessLevel) {
    await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        readOnly:      level === "readOnly",
        ownColumnOnly: level === "ownColumn",
      }),
    });
    loadUsers();
  }

  async function toggleAgent(username: string, current: boolean) {
    await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAgent: !current }),
    });
    loadUsers();
  }

  async function generateInvite() {
    setInviteLoading(true);
    setInviteResult(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isAgent:         inviteIsAgent,
          readOnly:        inviteAccess === "readOnly",
          ownColumnOnly:   inviteAccess === "ownColumn",
          expiresInMinutes: inviteExpiry,
        }),
      });
      if (res.ok) setInviteResult(await res.json());
    } finally {
      setInviteLoading(false);
    }
  }

  function copyLink() {
    if (!inviteResult) return;
    navigator.clipboard.writeText(inviteResult.url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800 flex-shrink-0">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Admin</h2>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-300 transition-colors"
            style={{ cursor: "pointer" }}
            title="Close"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-6">

          {/* ── Users ─────────────────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-widest text-gray-600 mb-3">Users</h3>
            {loadingUsers ? (
              <p className="text-xs text-gray-600">Loading…</p>
            ) : (
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u.username} className="flex items-center gap-2 min-h-[32px]">

                    {/* Name + column */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-200">{u.username}</span>
                      {u.columnName && u.columnName !== u.username && (
                        <span className="text-xs text-gray-600 ml-1.5">{u.columnName}</span>
                      )}
                    </div>

                    {/* Admin badge — no controls */}
                    {u.isAdmin ? (
                      <span className="text-xs text-amber-500 font-semibold uppercase tracking-wider px-1">
                        Admin
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* Human / Agent toggle */}
                        <button
                          onClick={() => toggleAgent(u.username, u.isAgent)}
                          title={u.isAgent ? "Switch to human" : "Switch to agent"}
                          className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                            u.isAgent
                              ? "border-purple-700 text-purple-400 bg-purple-900/20"
                              : "border-gray-700 text-gray-500 hover:text-gray-300"
                          }`}
                          style={{ cursor: "pointer" }}
                        >
                          {u.isAgent ? "Agent" : "Human"}
                        </button>

                        {/* Access level pills */}
                        <div className="flex gap-0.5">
                          <Pill active={getAccessLevel(u) === "full"}      onClick={() => setAccess(u.username, "full")}>Full</Pill>
                          <Pill active={getAccessLevel(u) === "ownColumn"} onClick={() => setAccess(u.username, "ownColumn")}>Own col</Pill>
                          <Pill active={getAccessLevel(u) === "readOnly"}  onClick={() => setAccess(u.username, "readOnly")}>Read</Pill>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Generate invite ───────────────────────────────────────────── */}
          <section className="border-t border-gray-800 pt-5">
            <h3 className="text-xs uppercase tracking-widest text-gray-600 mb-3">Invite new user</h3>
            <div className="space-y-3">

              {/* Type row */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-12 flex-shrink-0">Type</span>
                <div className="flex gap-1">
                  <Pill active={!inviteIsAgent} onClick={() => setInviteIsAgent(false)}>Human</Pill>
                  <Pill active={inviteIsAgent}  onClick={() => setInviteIsAgent(true)}>Agent</Pill>
                </div>
              </div>

              {/* Access row */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-12 flex-shrink-0">Access</span>
                <div className="flex gap-1">
                  <Pill active={inviteAccess === "full"}      onClick={() => setInviteAccess("full")}>Full</Pill>
                  <Pill active={inviteAccess === "ownColumn"} onClick={() => setInviteAccess("ownColumn")}>Own column</Pill>
                  <Pill active={inviteAccess === "readOnly"}  onClick={() => setInviteAccess("readOnly")}>Read only</Pill>
                </div>
              </div>

              {/* Expiry row */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-12 flex-shrink-0">Expires</span>
                <div className="flex gap-1">
                  {([[60, "1 h"], [1440, "24 h"], [10080, "7 d"]] as [number, string][]).map(([mins, label]) => (
                    <Pill key={mins} active={inviteExpiry === mins} onClick={() => setInviteExpiry(mins)}>
                      {label}
                    </Pill>
                  ))}
                </div>
              </div>

              <button
                onClick={generateInvite}
                disabled={inviteLoading}
                className="w-full py-2 mt-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm rounded-lg transition-colors"
                style={{ cursor: inviteLoading ? "default" : "pointer" }}
              >
                {inviteLoading ? "Generating…" : "Generate invite link"}
              </button>

              {/* Generated link */}
              {inviteResult && (
                <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 space-y-2">
                  <p className="text-xs text-gray-300 break-all font-mono leading-relaxed">
                    {inviteResult.url}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">
                      Expires {new Date(inviteResult.expiresAt).toLocaleString()}
                    </span>
                    <button
                      onClick={copyLink}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
                      style={{ cursor: "pointer" }}
                    >
                      {copied ? "Copied ✓" : "Copy link"}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
