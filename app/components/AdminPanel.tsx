"use client";

import { useEffect, useRef, useState } from "react";

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

// ── Pill toggle button ────────────────────────────────────────────────────────
function Pill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

// ── Section divider ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-gray-800 pt-5">
      <h3 className="text-xs uppercase tracking-widest text-gray-600 mb-3">{title}</h3>
      {children}
    </section>
  );
}

// ── Hold-to-confirm button ────────────────────────────────────────────────────
// User must press-and-hold for `holdMs` ms before the action fires.
// Safe for fat fingers on mobile.
function HoldButton({
  label,
  onConfirm,
  holdMs = 1500,
  color = "red",
  disabled = false,
}: {
  label: string;
  onConfirm: () => void;
  holdMs?: number;
  color?: "red" | "amber";
  disabled?: boolean;
}) {
  const [progress, setProgress] = useState(0);
  const frameRef  = useRef<number | null>(null);
  const startRef  = useRef<number>(0);
  const firedRef  = useRef(false);

  const colorMap = {
    red:   { bg: "bg-red-900/40",   border: "border-red-700",   fill: "bg-red-500",   text: "text-red-300" },
    amber: { bg: "bg-amber-900/30", border: "border-amber-700", fill: "bg-amber-500", text: "text-amber-300" },
  };
  const c = colorMap[color];

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
      className={`relative w-full py-2 mt-1 text-sm rounded-lg border overflow-hidden select-none transition-colors
        ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
        ${c.bg} ${c.border} ${c.text}`}
    >
      {/* Fill bar */}
      {progress > 0 && (
        <span
          className={`absolute inset-y-0 left-0 ${c.fill} opacity-30 transition-none`}
          style={{ width: `${progress}%` }}
        />
      )}
      <span className="relative">
        {progress > 0 ? `Hold… ${Math.round(progress)}%` : label}
      </span>
    </button>
  );
}

// ── Admin panel modal ─────────────────────────────────────────────────────────
export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [users,        setUsers]        = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Invite form
  const [inviteIsAgent,  setInviteIsAgent]  = useState(false);
  const [inviteAccess,   setInviteAccess]   = useState<AccessLevel>("ownColumn");
  const [inviteExpiry,   setInviteExpiry]   = useState(1440);
  const [inviteResult,   setInviteResult]   = useState<{ url: string; expiresAt: string } | null>(null);
  const [inviteLoading,  setInviteLoading]  = useState(false);
  const [copied,         setCopied]         = useState(false);

  // Reset password
  const [resetTarget,   setResetTarget]   = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetMsg,      setResetMsg]      = useState<string | null>(null);

  // Purge completed
  const [purgeCount,    setPurgeCount]    = useState<number | null>(null);
  const [purgeDays,     setPurgeDays]     = useState<"all" | number>("all");
  const [purgeMsg,      setPurgeMsg]      = useState<string | null>(null);

  // Purge graveyard
  const [graveCount,    setGraveCount]    = useState<number | null>(null);
  const [graveDays,     setGraveDays]     = useState<"all" | number>("all");
  const [graveMsg,      setGraveMsg]      = useState<string | null>(null);

  // Agent token
  const [tokenTarget,   setTokenTarget]   = useState("");
  const [tokenValue,    setTokenValue]    = useState<string | null>(null);
  const [tokenCopied,   setTokenCopied]   = useState(false);

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const list: AdminUser[] = await res.json();
        setUsers(list);
        // Default selects to first non-admin user
        const first = list.find(u => !u.isAdmin);
        if (first) {
          if (!resetTarget)  setResetTarget(first.username);
          if (!tokenTarget)  setTokenTarget(first.username);
        }
      }
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // Fetch purge counts on mount
    fetch("/api/admin/purge-completed").then(r => r.json()).then(d => setPurgeCount(d.count ?? null));
    fetch("/api/admin/purge-graveyard").then(r => r.json()).then(d => setGraveCount(d.count ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          isAgent: inviteIsAgent,
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

  function copyInvite() {
    if (!inviteResult) return;
    navigator.clipboard.writeText(inviteResult.url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // ── Reset password ─────────────────────────────────────────────────────────
  async function doResetPassword() {
    setResetMsg(null);
    const res = await fetch("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: resetTarget, newPassword: resetPassword }),
    });
    if (res.ok) {
      setResetMsg(`Password reset for ${resetTarget}. Their session has been invalidated.`);
      setResetPassword("");
    } else {
      const d = await res.json();
      setResetMsg(`Error: ${d.error}`);
    }
  }

  // ── Purge completed ────────────────────────────────────────────────────────
  async function doPurge() {
    setPurgeMsg(null);
    const body = purgeDays === "all" ? {} : { olderThanDays: purgeDays };
    const res = await fetch("/api/admin/purge-completed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { deleted } = await res.json();
      setPurgeMsg(`Deleted ${deleted} completed task${deleted !== 1 ? "s" : ""}.`);
      setPurgeCount(0);
    } else {
      setPurgeMsg("Error purging tasks.");
    }
  }

  // ── Purge graveyard ────────────────────────────────────────────────────────
  async function doPurgeGrave() {
    setGraveMsg(null);
    const body = graveDays === "all" ? {} : { olderThanDays: graveDays };
    const res = await fetch("/api/admin/purge-graveyard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { deleted } = await res.json();
      setGraveMsg(`Deleted ${deleted} archived list${deleted !== 1 ? "s" : ""} and their tasks.`);
      setGraveCount(0);
    } else {
      setGraveMsg("Error purging graveyard.");
    }
  }

  // ── Agent token ────────────────────────────────────────────────────────────
  async function doGenToken() {
    setTokenValue(null);
    setTokenCopied(false);
    const res = await fetch("/api/admin/agent-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: tokenTarget }),
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

  const nonAdmins = users.filter(u => !u.isAdmin);

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
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-200">{u.username}</span>
                      {u.columnName && u.columnName !== u.username && (
                        <span className="text-xs text-gray-600 ml-1.5">{u.columnName}</span>
                      )}
                    </div>
                    {u.isAdmin ? (
                      <span className="text-xs text-amber-500 font-semibold uppercase tracking-wider px-1">Admin</span>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
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

          {/* ── Invite new user ────────────────────────────────────────────── */}
          <Section title="Invite new user">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-14 flex-shrink-0">Type</span>
                <div className="flex gap-1">
                  <Pill active={!inviteIsAgent} onClick={() => setInviteIsAgent(false)}>Human</Pill>
                  <Pill active={inviteIsAgent}  onClick={() => setInviteIsAgent(true)}>Agent</Pill>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-14 flex-shrink-0">Access</span>
                <div className="flex gap-1">
                  <Pill active={inviteAccess === "full"}      onClick={() => setInviteAccess("full")}>Full</Pill>
                  <Pill active={inviteAccess === "ownColumn"} onClick={() => setInviteAccess("ownColumn")}>Own column</Pill>
                  <Pill active={inviteAccess === "readOnly"}  onClick={() => setInviteAccess("readOnly")}>Read only</Pill>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-14 flex-shrink-0">Expires</span>
                <div className="flex gap-1">
                  {([[60, "1 h"], [1440, "24 h"], [10080, "7 d"]] as [number, string][]).map(([mins, label]) => (
                    <Pill key={mins} active={inviteExpiry === mins} onClick={() => setInviteExpiry(mins)}>{label}</Pill>
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
              {inviteResult && (
                <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 space-y-2">
                  <p className="text-xs text-gray-300 break-all font-mono leading-relaxed">{inviteResult.url}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">
                      Expires {new Date(inviteResult.expiresAt).toLocaleString()}
                    </span>
                    <button
                      onClick={copyInvite}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
                      style={{ cursor: "pointer" }}
                    >
                      {copied ? "Copied ✓" : "Copy link"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* ── Agent token ────────────────────────────────────────────────── */}
          <Section title="Agent token">
            <div className="space-y-3">
              <p className="text-xs text-gray-600">Generate (or rotate) the MCP agent token for a user. Rotates instantly — existing token stops working.</p>
              <select
                value={tokenTarget}
                onChange={e => { setTokenTarget(e.target.value); setTokenValue(null); setTokenCopied(false); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
                style={{ cursor: "pointer" }}
              >
                {nonAdmins.map(u => (
                  <option key={u.username} value={u.username}>{u.username}</option>
                ))}
              </select>
              <HoldButton
                label="Hold to generate token"
                onConfirm={doGenToken}
                holdMs={1500}
                color="amber"
                disabled={!tokenTarget}
              />
              {tokenValue && (
                <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 space-y-2">
                  <p className="text-xs text-gray-300 break-all font-mono leading-relaxed">{tokenValue}</p>
                  <div className="flex justify-end">
                    <button
                      onClick={copyToken}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
                      style={{ cursor: "pointer" }}
                    >
                      {tokenCopied ? "Copied ✓" : "Copy token"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* ── Reset password ─────────────────────────────────────────────── */}
          <Section title="Reset password">
            <div className="space-y-3">
              <select
                value={resetTarget}
                onChange={e => { setResetTarget(e.target.value); setResetMsg(null); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
                style={{ cursor: "pointer" }}
              >
                {nonAdmins.map(u => (
                  <option key={u.username} value={u.username}>{u.username}</option>
                ))}
              </select>
              <input
                type="password"
                placeholder="New password (min 6 chars)"
                value={resetPassword}
                onChange={e => { setResetPassword(e.target.value); setResetMsg(null); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600"
              />
              <HoldButton
                label="Hold to reset password"
                onConfirm={doResetPassword}
                holdMs={2000}
                color="red"
                disabled={resetPassword.length < 6 || !resetTarget}
              />
              {resetMsg && (
                <p className={`text-xs ${resetMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                  {resetMsg}
                </p>
              )}
            </div>
          </Section>

          {/* ── Purge completed tasks ──────────────────────────────────────── */}
          <Section title="Purge completed tasks">
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                {purgeCount === null
                  ? "Counting…"
                  : purgeCount === 0
                  ? "No completed tasks in database."
                  : <><span className="text-gray-300 font-semibold">{purgeCount}</span> completed task{purgeCount !== 1 ? "s" : ""} in database.</>
                }
              </p>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-14 flex-shrink-0">Delete</span>
                <div className="flex gap-1">
                  <Pill active={purgeDays === "all"} onClick={() => setPurgeDays("all")}>All</Pill>
                  <Pill active={purgeDays === 30}    onClick={() => setPurgeDays(30)}>{'> 30 d'}</Pill>
                  <Pill active={purgeDays === 7}     onClick={() => setPurgeDays(7)}>{'> 7 d'}</Pill>
                </div>
              </div>
              <HoldButton
                label={`Hold to delete ${purgeDays === "all" ? "all" : `tasks older than ${purgeDays}d`}`}
                onConfirm={doPurge}
                holdMs={2000}
                color="red"
                disabled={purgeCount === 0}
              />
              {purgeMsg && (
                <p className={`text-xs ${purgeMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                  {purgeMsg}
                </p>
              )}
            </div>
          </Section>

          {/* ── Purge graveyard ────────────────────────────────────────────────── */}
          <Section title="Purge graveyard">
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                {graveCount === null
                  ? "Counting…"
                  : graveCount === 0
                  ? "Graveyard is empty."
                  : <><span className="text-gray-300 font-semibold">{graveCount}</span> archived list{graveCount !== 1 ? "s" : ""} in graveyard. All their tasks will be deleted too.</>
                }
              </p>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-14 flex-shrink-0">Delete</span>
                <div className="flex gap-1">
                  <Pill active={graveDays === "all"} onClick={() => setGraveDays("all")}>All</Pill>
                  <Pill active={graveDays === 30}    onClick={() => setGraveDays(30)}>{'> 30 d'}</Pill>
                  <Pill active={graveDays === 7}     onClick={() => setGraveDays(7)}>{'> 7 d'}</Pill>
                </div>
              </div>
              <HoldButton
                label={`Hold to delete ${graveDays === "all" ? "all" : `lists older than ${graveDays}d`}`}
                onConfirm={doPurgeGrave}
                holdMs={2000}
                color="red"
                disabled={graveCount === 0}
              />
              {graveMsg && (
                <p className={`text-xs ${graveMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                  {graveMsg}
                </p>
              )}
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}
