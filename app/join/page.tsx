"use client";

import { useEffect, useRef, useState } from "react";

function generatePassword(): string {
  const upper  = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower  = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const syms   = "!@#$%^&*";
  const all    = upper + lower + digits + syms;
  const bytes  = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Guarantee at least one of each class in the first 4 positions
  const pwd = [
    upper[bytes[0]  % upper.length],
    lower[bytes[1]  % lower.length],
    digits[bytes[2] % digits.length],
    syms[bytes[3]   % syms.length],
    ...Array.from(bytes.slice(4)).map(b => all[b % all.length]),
  ];
  // Fisher-Yates shuffle using fresh random bytes
  const shuffle = new Uint8Array(pwd.length);
  crypto.getRandomValues(shuffle);
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = shuffle[i] % (i + 1);
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join("");
}

export default function JoinPage() {
  // Read ?code= client-side — avoids Suspense "Loading…" as static HTML.
  const [code, setCode]           = useState("");
  const [checking, setChecking]   = useState(true);
  const [codeValid, setCodeValid] = useState(false);
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [showPass, setShowPass]   = useState(false);
  const [showConf, setShowConf]   = useState(false);
  const [autoPass, setAutoPass]   = useState("");
  const [copied, setCopied]       = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);
  const passRef     = useRef<HTMLInputElement>(null);
  const confRef     = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("code") ?? "";
    setCode(c);
    if (!c) { setChecking(false); return; }
    fetch(`/api/auth/validate-invite?code=${encodeURIComponent(c)}`)
      .then(r => r.json())
      .then(d => { setCodeValid(!!d.valid); setChecking(false); })
      .catch(() => { setCodeValid(false); setChecking(false); });
  }, []);

  function handleAutoGen() {
    const pwd = generatePassword();
    setAutoPass(pwd);
    if (passRef.current) passRef.current.value = pwd;
    if (confRef.current) confRef.current.value = pwd;
    setShowPass(true);
    setShowConf(true);
    setCopied(false);
  }

  function copyPassword() {
    navigator.clipboard.writeText(autoPass).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const username = usernameRef.current?.value?.trim() ?? "";
    const password = passRef.current?.value ?? "";
    const confirm  = confRef.current?.value ?? "";

    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }

    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, token: password, inviteCode: code }),
      });
      if (res.ok) {
        // Auth cookies were set by the register response — go straight to the board.
        window.location.href = "/";
        return;
      }
      const data = await res.json();
      setError(data.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Connection failed. Check your network and try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Checking code on mount ─────────────────────────────────────────────────
  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950 text-gray-600">
        <div className="text-sm">Checking code…</div>
      </div>
    );
  }

  // ── Invalid / missing code ─────────────────────────────────────────────────
  if (!code || !codeValid) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950 px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <h1 className="text-xl font-semibold text-gray-100">2Do Better</h1>
          <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-lg">
            <p className="text-red-300 text-sm">
              {!code ? "No setup code provided." : "This setup code is invalid or has expired."}
            </p>
          </div>
          <p className="text-gray-500 text-sm">Ask your admin to generate a new 4-digit code.</p>
          <a href="/login" className="inline-block text-sm text-blue-400 hover:text-blue-300 transition-colors">
            ← Back to sign in
          </a>
        </div>
      </div>
    );
  }

  // ── Setup form ─────────────────────────────────────────────────────────────
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-100 text-center mb-1">2Do Better</h1>
        <p className="text-base text-gray-400 text-center mb-1">Set up your account</p>
        <p className="text-xs text-gray-600 text-center mb-6">
          Setup code: <span className="font-mono text-gray-500 tracking-widest">{code}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            ref={usernameRef}
            type="text"
            name="username"
            placeholder="Choose a username"
            required
            minLength={2}
            autoFocus
            autoComplete="username"
            className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-base placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />

          <div className="relative">
            <input
              ref={passRef}
              type={showPass ? "text" : "password"}
              name="password"
              placeholder="Password  (8+ characters)"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full px-3 py-2.5 pr-16 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-base placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button type="button" onClick={() => setShowPass(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-sm text-gray-400 hover:text-gray-200"
              style={{ cursor: "pointer" }}>
              {showPass ? "Hide" : "Show"}
            </button>
          </div>

          <div className="relative">
            <input
              ref={confRef}
              type={showConf ? "text" : "password"}
              name="confirm"
              placeholder="Confirm password"
              required
              autoComplete="new-password"
              className="w-full px-3 py-2.5 pr-16 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-base placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button type="button" onClick={() => setShowConf(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-sm text-gray-400 hover:text-gray-200"
              style={{ cursor: "pointer" }}>
              {showConf ? "Hide" : "Show"}
            </button>
          </div>

          <button type="button" onClick={handleAutoGen}
            className="w-full py-2 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
            style={{ cursor: "pointer" }}>
            ↻ Auto-generate strong password
          </button>

          {autoPass && (
            <div className="flex items-center gap-2 p-3 bg-gray-900 border border-gray-700 rounded-lg">
              <span className="flex-1 font-mono text-sm text-gray-200 break-all leading-relaxed">{autoPass}</span>
              <button type="button" onClick={copyPassword}
                className="flex-shrink-0 text-xs text-blue-400 hover:text-blue-300 transition-colors font-medium"
                style={{ cursor: "pointer" }}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          )}
          {autoPass && (
            <p className="text-xs text-amber-600 text-center">
              Save this password before continuing — you will need it to sign in.
            </p>
          )}

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-base font-medium rounded-lg transition-colors"
            style={{ cursor: loading ? "default" : "pointer" }}>
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          <a href="/login" className="hover:text-gray-400 transition-colors">← Back to sign in</a>
        </p>
      </div>
    </div>
  );
}
