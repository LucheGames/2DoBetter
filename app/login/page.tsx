"use client";

import { useEffect, useRef, useState } from "react";

export default function LoginPage() {
  // Read ?created=1 client-side — avoids Suspense wrapper that makes the
  // pre-rendered HTML show "Loading…" instead of the actual login form.
  const [created, setCreated] = useState(false);
  const [codeDigits, setCodeDigits] = useState("");
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [showToken, setShowToken]   = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);
  const tokenRef    = useRef<HTMLInputElement>(null);

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

  function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const digits = codeDigits.trim();
    if (digits.length === 4 && /^\d{4}$/.test(digits)) {
      window.location.href = `/join?code=${digits}`;
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-100 text-center mb-1">
          2Do Better
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
            className="w-full px-3 py-2.5 mb-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-base placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />

          <div className="relative mb-4">
            <input
              ref={tokenRef}
              type={showToken ? "text" : "password"}
              name="token"
              placeholder="Password"
              required
              autoComplete="current-password"
              className="w-full px-3 py-2.5 pr-16 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-base placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-base font-medium rounded-lg transition-colors"
            style={{ cursor: loading ? "default" : "pointer" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-800">
          <p className="text-xs text-gray-600 text-center mb-3">Have a setup code from an admin?</p>
          <form onSubmit={handleCodeSubmit} className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              placeholder="4-digit code"
              value={codeDigits}
              onChange={e => setCodeDigits(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-base placeholder-gray-500 text-center tracking-widest focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={codeDigits.length !== 4}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 text-sm rounded-lg transition-colors"
              style={{ cursor: codeDigits.length !== 4 ? "default" : "pointer" }}
            >
              Set up →
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
