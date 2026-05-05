"use client";

import { useEffect, useRef, useState } from "react";

type Mode = "login" | "reset-verify" | "reset-password";

function generatePassword(): string {
  const upper  = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower  = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const syms   = "!@#$%^&*";
  const all    = upper + lower + digits + syms;
  const bytes  = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const pwd = [
    upper[bytes[0]  % upper.length],
    lower[bytes[1]  % lower.length],
    digits[bytes[2] % digits.length],
    syms[bytes[3]   % syms.length],
    ...Array.from(bytes.slice(4)).map(b => all[b % all.length]),
  ];
  const shuffle = new Uint8Array(pwd.length);
  crypto.getRandomValues(shuffle);
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = shuffle[i] % (i + 1);
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }
  return pwd.join("");
}

export default function LoginPage() {
  const [created, setCreated]     = useState(false);
  const [codeError, setCodeError] = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [mode, setMode]           = useState<Mode>("login");

  // Reset code flow
  const [resetToken, setResetToken]     = useState("");
  const [resetUser, setResetUser]       = useState("");
  const [showPass, setShowPass]         = useState(false);
  const [showConf, setShowConf]         = useState(false);
  const [autoPass, setAutoPass]         = useState("");
  const [passCopied, setPassCopied]     = useState(false);

  const usernameRef  = useRef<HTMLInputElement>(null);
  const tokenRef     = useRef<HTMLInputElement>(null);
  const codeRef      = useRef<HTMLInputElement>(null);
  const resetUserRef = useRef<HTMLInputElement>(null);
  const resetCodeRef = useRef<HTMLInputElement>(null);
  const passRef      = useRef<HTMLInputElement>(null);
  const confRef      = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCreated(new URLSearchParams(window.location.search).get("created") === "1");
  }, []);

  // ── Normal sign-in ────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const username = usernameRef.current?.value?.trim() ?? "";
    const token    = tokenRef.current?.value?.trim()    ?? "";
    if (!username || !token) {
      setError("Please enter your username and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, token }),
      });
      if (res.ok) { window.location.href = "/"; return; }
      setError("Invalid credentials");
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Setup code (new account invite) ───────────────────────────────────────
  function handleCodeGo() {
    const raw    = codeRef.current?.value ?? "";
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    if (digits.length !== 6) {
      setCodeError("Enter the 6-digit code from your admin.");
      return;
    }
    setCodeError("");
    window.location.href = `/join?code=${digits}`;
  }

  // ── Reset code verification ───────────────────────────────────────────────
  async function handleVerifyReset(e: React.FormEvent) {
    e.preventDefault();
    const username = resetUserRef.current?.value?.trim() ?? "";
    const code     = resetCodeRef.current?.value?.replace(/\D/g, "").slice(0, 8) ?? "";
    if (!username) { setError("Please enter your username."); return; }
    if (code.length !== 8) { setError("Enter the 8-digit reset code."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-temp-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, code }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setResetToken(data.resetToken);
        setResetUser(username);
        setMode("reset-password");
        setError("");
      } else {
        setError(data.error || "Invalid code");
      }
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Set new password ──────────────────────────────────────────────────────
  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    const password = passRef.current?.value ?? "";
    const confirm  = confRef.current?.value ?? "";
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm)  { setError("Passwords don't match."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, newPassword: password }),
      });
      if (res.ok) { window.location.href = "/"; return; }
      const data = await res.json();
      setError(data.error || "Failed to set password");
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  function handleAutoGen() {
    const pwd = generatePassword();
    setAutoPass(pwd);
    if (passRef.current) passRef.current.value = pwd;
    if (confRef.current) confRef.current.value = pwd;
    setShowPass(true);
    setShowConf(true);
    setPassCopied(false);
  }

  function copyPassword() {
    navigator.clipboard.writeText(autoPass).catch(() => {});
    setPassCopied(true);
    setTimeout(() => setPassCopied(false), 2000);
  }

  function switchToReset() {
    setMode("reset-verify");
    setError("");
    setLoading(false);
    setTimeout(() => resetUserRef.current?.focus(), 0);
  }

  function switchToLogin() {
    setMode("login");
    setError("");
    setLoading(false);
    setResetToken("");
    setResetUser("");
    setAutoPass("");
    setPassCopied(false);
  }

  // ── Shared header ─────────────────────────────────────────────────────────
  const header = (
    <>
      <h1 className="text-xl font-semibold text-gray-100 text-center mb-1 flex items-center justify-center gap-2">
        2Do Better
        <a href="https://www.buymeacoffee.com/headlessclaudesmann" target="_blank" rel="noopener noreferrer"
          title="Support development ☕"
          className="text-base leading-none text-gray-700 hover:text-yellow-400 transition-colors duration-200 select-none font-normal">
          ☕
        </a>
      </h1>
    </>
  );

  // ── Reset: set new password ───────────────────────────────────────────────
  if (mode === "reset-password") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950 px-4">
        <div className="w-full max-w-sm">
          {header}
          <p className="text-base text-gray-400 text-center mb-1">Choose a new password</p>
          <p className="text-xs text-gray-600 text-center mb-6">
            Signing in as <span className="text-gray-400">{resetUser}</span>
          </p>

          <form onSubmit={handleSetPassword} className="space-y-3">
            <div className="relative">
              <input
                ref={passRef}
                type={showPass ? "text" : "password"}
                placeholder="New password (8+ characters)"
                required
                minLength={8}
                autoFocus
                autoComplete="new-password"
                className="w-full px-3 py-2.5 pr-16 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-base placeholder-gray-500 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
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
                placeholder="Confirm password"
                required
                autoComplete="new-password"
                className="w-full px-3 py-2.5 pr-16 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-base placeholder-gray-500 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
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
                  className="flex-shrink-0 text-xs text-accent-400 hover:text-accent-500 transition-colors font-medium"
                  style={{ cursor: "pointer" }}>
                  {passCopied ? "Copied ✓" : "Copy"}
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
              className="w-full py-2.5 bg-accent-600 hover:bg-accent-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-base font-medium rounded-lg transition-colors"
              style={{ cursor: loading ? "default" : "pointer" }}>
              {loading ? "Setting password…" : "Set password & sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            <button onClick={switchToLogin} className="hover:text-gray-400 transition-colors" style={{ cursor: "pointer" }}>
              ← Back to sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── Reset: verify code ────────────────────────────────────────────────────
  if (mode === "reset-verify") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950 px-4">
        <div className="w-full max-w-sm">
          {header}
          <p className="text-base text-gray-400 text-center mb-6">
            Enter the reset code from your admin
          </p>

          <form onSubmit={handleVerifyReset} className="space-y-3">
            <input
              ref={resetUserRef}
              type="text"
              placeholder="Username"
              required
              autoFocus
              autoComplete="username"
              className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-base placeholder-gray-500 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
            />
            <input
              ref={resetCodeRef}
              type="tel"
              inputMode="numeric"
              maxLength={9}
              placeholder="8-digit reset code"
              className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-base placeholder-gray-500 text-center tracking-[0.2em] focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
            />

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-accent-600 hover:bg-accent-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-base font-medium rounded-lg transition-colors"
              style={{ cursor: loading ? "default" : "pointer" }}>
              {loading ? "Verifying…" : "Verify code"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            <button onClick={switchToLogin} className="hover:text-gray-400 transition-colors" style={{ cursor: "pointer" }}>
              ← Back to sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── Normal sign-in ────────────────────────────────────────────────────────
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        {header}
        <p className="text-base text-gray-400 text-center mb-6">
          Sign in to continue
        </p>

        {created && (
          <div className="mb-5 p-3 bg-green-900/30 border border-green-700/50 rounded-lg text-center">
            <p className="text-green-300 text-sm">Account created — please sign in.</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input
            ref={usernameRef}
            type="text"
            name="username"
            placeholder="Username"
            required
            autoFocus
            autoComplete="username"
            className="w-full px-3 py-2.5 mb-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-base placeholder-gray-500 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
          />

          <div className="relative mb-4">
            <input
              ref={tokenRef}
              type={showToken ? "text" : "password"}
              name="token"
              placeholder="Password"
              required
              autoComplete="current-password"
              className="w-full px-3 py-2.5 pr-16 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-base placeholder-gray-500 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-sm text-gray-400 hover:text-gray-200"
              style={{ cursor: "pointer" }}
            >
              {showToken ? "Hide" : "Show"}
            </button>
          </div>

          {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-accent-600 hover:bg-accent-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-base font-medium rounded-lg transition-colors"
            style={{ cursor: loading ? "default" : "pointer" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={switchToReset}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            style={{ cursor: "pointer" }}
          >
            Have a reset code?
          </button>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-800">
          <p className="text-xs text-gray-600 text-center mb-3">Have a setup code from an admin?</p>
          <div className="flex gap-2">
            <input
              ref={codeRef}
              type="tel"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCodeGo(); }}
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-base placeholder-gray-500 text-center tracking-widest focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
            />
            <button
              type="button"
              onClick={handleCodeGo}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg transition-colors"
              style={{ cursor: "pointer" }}
            >
              Set up →
            </button>
          </div>
          {codeError && <p className="text-red-400 text-xs mt-2 text-center">{codeError}</p>}
        </div>
      </div>
    </div>
  );
}
