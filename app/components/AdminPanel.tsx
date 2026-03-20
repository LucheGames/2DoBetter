"use client";

import { useEffect, useRef, useState } from "react";

type AdminUser = {
  username: string;
  isAdmin: boolean;
  isAgent: boolean;
  readOnly: boolean;
  ownColumnOnly: boolean;
  columnName: string | null;
  supervisorUsername: string | null;
};

type AccessLevel = "full" | "ownColumn" | "readOnly";

function getAccessLevel(u: AdminUser): AccessLevel {
  if (u.readOnly)      return "readOnly";
  if (u.ownColumnOnly) return "ownColumn";
  return "full";
}

// ── Pill toggle button ────────────────────────────────────────────────────────
function Pill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 admin-xs rounded transition-colors ${
        active
          ? "bg-accent-600 text-white"
          : "bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
      }`}
      style={{ cursor: "pointer" }}
    >
      {children}
    </button>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-gray-800 pt-5">
      <h3 className="admin-title uppercase tracking-widest mb-3">{title}</h3>
      {children}
    </section>
  );
}

// ── Hold-to-confirm button ────────────────────────────────────────────────────
// User must press-and-hold for `holdMs` ms before the action fires.
function HoldButton({
  label,
  onConfirm,
  holdMs = 1500,
  variant = "destructive",
  disabled = false,
}: {
  label: string;
  onConfirm: () => void;
  holdMs?: number;
  variant?: "destructive" | "neutral";
  disabled?: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const frameRef  = useRef<number | null>(null);
  const startRef  = useRef<number>(0);
  const firedRef  = useRef(false);

  const styles = variant === "destructive"
    ? { bg: "bg-fuchsia-900/40", border: "border-fuchsia-700", fill: "bg-fuchsia-500", text: "text-fuchsia-300" }
    : { bg: "bg-gray-800/60",   border: "border-gray-600",   fill: "bg-gray-500",   text: "text-gray-300" };

  function startHold(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (disabled) return;
    firedRef.current = false;
    startRef.current = performance.now();

    function tick() {
      const elapsed = performance.now() - startRef.current;
      const pct = Math.min(100, (elapsed / holdMs) * 100);
      setProgress(pct);
      if (pct < 100) {
        frameRef.current = requestAnimationFrame(tick);
      } else if (!firedRef.current) {
        firedRef.current = true;
        setProgress(0);
        onConfirm();
      }
    }
    frameRef.current = requestAnimationFrame(tick);
  }

  function endHold() {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    setProgress(0);
  }

  return (
    <button
      onMouseDown={startHold}
      onMouseUp={endHold}
      onMouseLeave={endHold}
      onTouchStart={startHold}
      onTouchEnd={endHold}
      onTouchCancel={endHold}
      disabled={disabled}
      className={`relative w-full py-2 mt-1 admin-sm rounded-lg border overflow-hidden select-none transition-colors
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
        ${styles.bg} ${styles.border} ${styles.text}`}
    >
      {/* Fill bar */}
      {progress > 0 && (
        <span
          className={`absolute inset-y-0 left-0 ${styles.fill} opacity-30 transition-none`}
          style={{ width: `${progress}%` }}
        />
      )}
      <span className="relative">
        {progress > 0 ? `Hold\u2026 ${Math.round(progress)}%` : label}
      </span>
    </button>
  );
}

// ── Admin panel modal ─────────────────────────────────────────────────────────
export default function AdminPanel({ onClose, onDataChanged }: { onClose: () => void; onDataChanged?: () => void }) {
  const [users,        setUsers]        = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Invite form
  const [inviteAccess,   setInviteAccess]   = useState<AccessLevel>("ownColumn");
  const [inviteExpiry,   setInviteExpiry]   = useState(10);
  const [inviteResult,   setInviteResult]   = useState<{ code: string; url: string; expiresAt: string } | null>(null);
  const [inviteLoading,  setInviteLoading]  = useState(false);
  const [copied,         setCopied]         = useState(false);

  // Manage user (merged section)
  const [manageTarget,  setManageTarget]  = useState("");
  const [renameNew,     setRenameNew]     = useState("");
  const [renameMsg,     setRenameMsg]     = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetMsg,      setResetMsg]      = useState<string | null>(null);
  const [tokenValue,    setTokenValue]    = useState<string | null>(null);
  const [tokenCopied,   setTokenCopied]   = useState(false);
  const [removeMsg,     setRemoveMsg]     = useState<string | null>(null);

  // Create agent
  const [createAgentName,       setCreateAgentName]       = useState("");
  const [createAgentSupervisor, setCreateAgentSupervisor] = useState("");
  const [createAgentAccess,     setCreateAgentAccess]     = useState<"full" | "ownColumn">("ownColumn");
  const [createAgentLoading,    setCreateAgentLoading]    = useState(false);
  const [createAgentToken,      setCreateAgentToken]      = useState<string | null>(null);
  const [createAgentTokenCopied,setCreateAgentTokenCopied]= useState(false);
  const [createAgentMsg,        setCreateAgentMsg]        = useState<string | null>(null);

  async function loadUsers() {
    // loadingUsers starts as true (initial state) — don't re-show "Loading…"
    // on re-fetches, so toggling agent/access doesn't flash the whole panel.
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const list: AdminUser[] = await res.json();
        setUsers(list);
        // Default manage target to first non-admin user
        const first = list.find(u => !u.isAdmin);
        if (first && !manageTarget) {
          setManageTarget(first.username);
        }
      }
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear action-specific state when switching manage target
  function switchManageTarget(username: string) {
    setManageTarget(username);
    setRenameNew("");
    setRenameMsg(null);
    setResetPassword("");
    setResetMsg(null);
    setTokenValue(null);
    setTokenCopied(false);
    setRemoveMsg(null);
  }

  // ── User flag helpers ──────────────────────────────────────────────────────
  async function setAccess(username: string, level: AccessLevel) {
    await fetch(`/api/admin/users/${encodeURIComponent(username)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readOnly: level === "readOnly", ownColumnOnly: level === "ownColumn" }),
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

  // ── Invite ─────────────────────────────────────────────────────────────────
  async function generateInvite() {
    setInviteLoading(true);
    setInviteResult(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isAgent: false,
          readOnly: inviteAccess === "readOnly",
          ownColumnOnly: inviteAccess === "ownColumn",
          expiresInMinutes: inviteExpiry,
        }),
      });
      if (res.ok) setInviteResult(await res.json());
    } finally {
      setInviteLoading(false);
    }
  }

  function copyInviteCode() {
    if (!inviteResult) return;
    navigator.clipboard.writeText(inviteResult.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // ── Manage user actions ──────────────────────────────────────────────────────
  async function doGenToken() {
    setTokenValue(null);
    setTokenCopied(false);
    const res = await fetch("/api/admin/agent-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: manageTarget }),
    });
    if (res.ok) {
      const { token } = await res.json();
      setTokenValue(token);
    }
  }

  function copyToken() {
    if (!tokenValue) return;
    navigator.clipboard.writeText(tokenValue).catch(() => {});
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2500);
  }

  async function doResetPassword() {
    setResetMsg(null);
    const res = await fetch("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: manageTarget, newPassword: resetPassword }),
    });
    if (res.ok) {
      setResetMsg(`Password reset for ${manageTarget}. Session invalidated.`);
      setResetPassword("");
    } else {
      const d = await res.json();
      setResetMsg(`Error: ${d.error}`);
    }
  }

  async function doRenameUser() {
    setRenameMsg(null);
    const res = await fetch("/api/admin/rename-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldUsername: manageTarget, newUsername: renameNew.trim() }),
    });
    const d = await res.json();
    if (res.ok) {
      setRenameMsg(`Renamed to "${d.newUsername}".`);
      setRenameNew("");
      setManageTarget(d.newUsername);
      loadUsers();
      onDataChanged?.();
    } else {
      setRenameMsg(`Error: ${d.error}`);
    }
  }

  async function doRemoveUser() {
    setRemoveMsg(null);
    const res = await fetch(
      `/api/admin/users/${encodeURIComponent(manageTarget)}?deleteData=true`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setRemoveMsg(`"${manageTarget}" removed — user and all data deleted.`);
      setManageTarget("");
      loadUsers();
      onDataChanged?.();
    } else {
      const d = await res.json().catch(() => ({}));
      setRemoveMsg(`Error: ${d.error ?? "Unknown error"}`);
    }
  }

  // ── Create agent ───────────────────────────────────────────────────────────
  async function doCreateAgent() {
    setCreateAgentMsg(null);
    setCreateAgentToken(null);
    setCreateAgentTokenCopied(false);
    setCreateAgentLoading(true);
    try {
      const res = await fetch("/api/admin/create-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName: createAgentName.trim(),
          supervisorUsername: createAgentSupervisor || undefined,
          ownColumnOnly: createAgentAccess === "ownColumn",
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setCreateAgentToken(d.agentToken);
        setCreateAgentName("");
        loadUsers();
        onDataChanged?.();
      } else {
        setCreateAgentMsg(`Error: ${d.error ?? "Unknown error"}`);
      }
    } finally {
      setCreateAgentLoading(false);
    }
  }

  const nonAdmins = users.filter(u => !u.isAdmin);
  const humans    = users.filter(u => !u.isAdmin && !u.isAgent);
  const manageUser = users.find(u => u.username === manageTarget);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800 flex-shrink-0">
          <h2 className="admin-sm font-semibold text-gray-400 uppercase tracking-widest">Admin</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            style={{ cursor: "pointer" }}
            title="Close"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* ── Users ─────────────────────────────────────────────────────── */}
          <section>
            <h3 className="admin-title uppercase tracking-widest mb-3">Users</h3>
            {loadingUsers ? (
              <p className="admin-xs text-gray-500">Loading\u2026</p>
            ) : (
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u.username} className="flex items-center gap-2 min-h-[32px]">
                    {/* Badge — left of name */}
                    {u.isAdmin ? (
                      <span className="px-2 py-0.5 admin-xs rounded border border-accent-700 text-accent-500 min-w-[3.5rem] text-center flex-shrink-0">
                        Admin
                      </span>
                    ) : (
                      <button
                        onClick={() => toggleAgent(u.username, u.isAgent)}
                        title={u.isAgent ? "Switch to human" : "Switch to agent"}
                        className={`px-2 py-0.5 admin-xs rounded border transition-colors min-w-[3.5rem] text-center flex-shrink-0 ${
                          u.isAgent
                            ? "border-accent-700 text-accent-400 bg-accent-900/20"
                            : "border-gray-700 text-gray-500 hover:text-gray-300"
                        }`}
                        style={{ cursor: "pointer" }}
                      >
                        {u.isAgent ? "Agent" : "Human"}
                      </button>
                    )}
                    {/* Name + subtext */}
                    <div className="flex-1 min-w-0">
                      <span className="admin-sm text-gray-200">{u.username}</span>
                      {u.columnName && u.columnName !== u.username && (
                        <span className="admin-xs text-gray-500 ml-1.5">{u.columnName}</span>
                      )}
                      {u.isAgent && u.supervisorUsername && (
                        <span className="admin-xs text-gray-500 ml-1.5">→ {u.supervisorUsername}</span>
                      )}
                    </div>
                    {/* Access pills — right side, non-admin only */}
                    {!u.isAdmin && (
                      <div className="flex gap-0.5 flex-shrink-0">
                        <Pill active={getAccessLevel(u) === "full"}      onClick={() => setAccess(u.username, "full")}>Full</Pill>
                        <Pill active={getAccessLevel(u) === "ownColumn"} onClick={() => setAccess(u.username, "ownColumn")}>Own col</Pill>
                        <Pill active={getAccessLevel(u) === "readOnly"}  onClick={() => setAccess(u.username, "readOnly")}>Read</Pill>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Invite new user ────────────────────────────────────────────── */}
          <Section title="Invite new user">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="admin-xs text-gray-500 w-14 flex-shrink-0">Access</span>
                <div className="flex gap-1">
                  <Pill active={inviteAccess === "full"}      onClick={() => setInviteAccess("full")}>Full</Pill>
                  <Pill active={inviteAccess === "ownColumn"} onClick={() => setInviteAccess("ownColumn")}>Own column</Pill>
                  <Pill active={inviteAccess === "readOnly"}  onClick={() => setInviteAccess("readOnly")}>Read only</Pill>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="admin-xs text-gray-500 w-14 flex-shrink-0">Expires</span>
                <div className="flex gap-1">
                  {([[10, "10 m"], [30, "30 m"], [60, "1 h"]] as [number, string][]).map(([mins, label]) => (
                    <Pill key={mins} active={inviteExpiry === mins} onClick={() => setInviteExpiry(mins)}>{label}</Pill>
                  ))}
                </div>
              </div>
              <button
                onClick={generateInvite}
                disabled={inviteLoading}
                className="w-full py-2 mt-1 bg-accent-600 hover:bg-accent-500 disabled:bg-gray-800 disabled:text-gray-500 text-white admin-sm rounded-lg transition-colors"
                style={{ cursor: inviteLoading ? "default" : "pointer" }}
              >
                {inviteLoading ? "Generating\u2026" : "Generate setup code"}
              </button>
              {inviteResult && (
                <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700/50 space-y-3 text-center">
                  <div className="text-5xl font-mono font-bold tracking-[0.25em] text-gray-100 py-2">
                    {inviteResult.code}
                  </div>
                  <div className="flex items-center justify-between admin-xs text-gray-500">
                    <span>Expires {new Date(inviteResult.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    <button
                      onClick={copyInviteCode}
                      className="text-gray-400 hover:text-gray-200 transition-colors font-medium"
                      style={{ cursor: "pointer" }}
                    >
                      {copied ? "Copied \u2713" : "Copy code"}
                    </button>
                  </div>
                  <p className="admin-xs text-gray-500">Tell the new user to enter this on the sign-in page.</p>
                </div>
              )}
            </div>
          </Section>

          {/* ── Create agent ───────────────────────────────────────────────── */}
          <Section title="Create agent">
            <div className="space-y-3">
              <p className="admin-xs text-gray-500">Create an AI agent directly — no invite needed. Token shown once.</p>
              <input
                type="text"
                placeholder="Agent name"
                value={createAgentName}
                onChange={e => { setCreateAgentName(e.target.value); setCreateAgentMsg(null); setCreateAgentToken(null); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 admin-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-accent-500"
              />
              <div className="flex items-center gap-3">
                <span className="admin-xs text-gray-500 w-20 flex-shrink-0">Supervisor</span>
                <select
                  value={createAgentSupervisor}
                  onChange={e => setCreateAgentSupervisor(e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 admin-sm text-gray-200"
                  style={{ cursor: "pointer" }}
                >
                  <option value="">{"\u2014"} None {"\u2014"}</option>
                  {humans.map(u => (
                    <option key={u.username} value={u.username}>{u.username}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <span className="admin-xs text-gray-500 w-20 flex-shrink-0">Access</span>
                <div className="flex gap-1">
                  <Pill active={createAgentAccess === "ownColumn"} onClick={() => setCreateAgentAccess("ownColumn")}>Own column</Pill>
                  <Pill active={createAgentAccess === "full"}      onClick={() => setCreateAgentAccess("full")}>Full board</Pill>
                </div>
              </div>
              <button
                onClick={doCreateAgent}
                disabled={createAgentLoading || createAgentName.trim().length < 2}
                className="w-full py-2 mt-1 bg-accent-600 hover:bg-accent-500 disabled:bg-gray-800 disabled:text-gray-500 text-white admin-sm rounded-lg transition-colors"
                style={{ cursor: createAgentLoading || createAgentName.trim().length < 2 ? "default" : "pointer" }}
              >
                {createAgentLoading ? "Creating\u2026" : "Create agent"}
              </button>
              {createAgentMsg && (
                <p className="admin-xs text-red-400">{createAgentMsg}</p>
              )}
              {createAgentToken && (
                <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 space-y-2">
                  <p className="admin-xs text-green-400 mb-1">Agent created! Copy token below — shown once.</p>
                  <p className="admin-xs text-gray-300 break-all font-mono leading-relaxed">{createAgentToken}</p>
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createAgentToken).catch(() => {});
                        setCreateAgentTokenCopied(true);
                        setTimeout(() => setCreateAgentTokenCopied(false), 2500);
                      }}
                      className="admin-xs text-gray-400 hover:text-gray-200 transition-colors font-medium"
                      style={{ cursor: "pointer" }}
                    >
                      {createAgentTokenCopied ? "Copied \u2713" : "Copy token"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* ── Manage user (merged: token, password, rename, remove) ────── */}
          {nonAdmins.length > 0 && (
            <Section title="Manage user">
              <div className="space-y-4">
                {/* User selector */}
                <select
                  value={manageTarget}
                  onChange={e => switchManageTarget(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 admin-sm text-gray-200"
                  style={{ cursor: "pointer" }}
                >
                  {nonAdmins.map(u => (
                    <option key={u.username} value={u.username}>{u.username}</option>
                  ))}
                </select>

                {manageUser && (
                  <>
                    {/* ─ Agent token ─ */}
                    <div className="space-y-2">
                      <p className="admin-xs text-gray-500">Rotate agent token — existing token stops working instantly.</p>
                      <HoldButton
                        label="Hold to generate token"
                        onConfirm={doGenToken}
                        holdMs={1500}
                        variant="neutral"
                        disabled={!manageTarget}
                      />
                      {tokenValue && (
                        <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 space-y-2">
                          <p className="admin-xs text-gray-300 break-all font-mono leading-relaxed">{tokenValue}</p>
                          <div className="flex justify-end">
                            <button
                              onClick={copyToken}
                              className="admin-xs text-gray-400 hover:text-gray-200 transition-colors font-medium"
                              style={{ cursor: "pointer" }}
                            >
                              {tokenCopied ? "Copied \u2713" : "Copy token"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ─ Reset password ─ */}
                    <div className="space-y-2">
                      <input
                        type="password"
                        placeholder="New password (min 6 chars)"
                        value={resetPassword}
                        onChange={e => { setResetPassword(e.target.value); setResetMsg(null); }}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 admin-sm text-gray-200 placeholder-gray-500"
                      />
                      <HoldButton
                        label="Hold to reset password"
                        onConfirm={doResetPassword}
                        holdMs={2000}
                        variant="destructive"
                        disabled={resetPassword.length < 6 || !manageTarget}
                      />
                      {resetMsg && (
                        <p className={`admin-xs ${resetMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                          {resetMsg}
                        </p>
                      )}
                    </div>

                    {/* ─ Rename ─ */}
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="New username"
                        value={renameNew}
                        onChange={e => { setRenameNew(e.target.value); setRenameMsg(null); }}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 admin-sm text-gray-200 placeholder-gray-500"
                      />
                      <HoldButton
                        label="Hold to rename"
                        onConfirm={doRenameUser}
                        holdMs={1500}
                        variant="neutral"
                        disabled={renameNew.trim().length < 2 || !manageTarget || renameNew.trim() === manageTarget}
                      />
                      {renameMsg && (
                        <p className={`admin-xs ${renameMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                          {renameMsg}
                        </p>
                      )}
                    </div>

                    {/* ─ Remove ─ */}
                    <div className="space-y-2">
                      <HoldButton
                        label="Hold to delete user"
                        onConfirm={doRemoveUser}
                        holdMs={2000}
                        variant="destructive"
                        disabled={!manageTarget}
                      />
                      {removeMsg && (
                        <p className={`admin-xs ${removeMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                          {removeMsg}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </Section>
          )}

        </div>
      </div>
    </div>
  );
}
