"use client";

import { useEffect, useRef, useState } from "react";

export default function LoginPage() {
  // Read ?created=1 client-side — avoids Suspense wrapper that makes the
  // pre-rendered HTML show "Loading…" instead of the actual login form.
  const [created, setCreated]     = useState(false);
  const [codeError, setCodeError] = useState("");
  const [error, setError]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [showToken, setShowToken] = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);
  const tokenRef    = useRef<HTMLInputElement>(null);
  // Use a ref for the code input — avoids controlled-state issues on
  // Android keyboards where onChange may not fire for every keystroke.
  const codeRef     = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCreated(new URLSearchParams(window.location.search).get("created") === "1");
  }, []);

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

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-100 text-center mb-1 flex items-center justify-center gap-2">
          2Do Better
          <a href="https://www.buymeacoffee.com/luchegames" target="_blank" rel="noopener noreferrer"
            title="Support development ☕"
            className="text-base leading-none text-gray-700 hover:text-yellow-400 transition-colors duration-200 select-none font-normal">
            ☕
          </a>
        </h1>
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

        <div className="mt-8 pt-6 border-t border-gray-800">
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
