"use client";

import { useEffect, useState } from "react";

// ── Sign-in form ──────────────────────────────────────────────────────────────
function SignInForm({
  registrationEnabled,
  onSwitch,
}: {
  registrationEnabled: boolean;
  onSwitch: () => void;
}) {
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), token: token.trim() }),
      });
      if (res.ok) { window.location.href = "/"; return; }
      setError("Invalid credentials");
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        autoFocus
        autoComplete="username"
        className="w-full px-3 py-2.5 mb-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />

      <div className="relative mb-4">
        <input
          type={showToken ? "text" : "password"}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Access token"
          autoComplete="current-password"
          className="w-full px-3 py-2.5 pr-16 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => setShowToken(!showToken)}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-gray-500 hover:text-gray-300"
          style={{ cursor: "pointer" }}
        >
          {showToken ? "Hide" : "Show"}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading || !username.trim() || !token.trim()}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
        style={{ cursor: loading || !username.trim() || !token.trim() ? "default" : "pointer" }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>

      {registrationEnabled && (
        <p className="mt-6 text-center text-xs text-gray-600">
          Have an invite code?{" "}
          <button
            type="button"
            onClick={onSwitch}
            className="text-gray-400 hover:text-gray-200 underline underline-offset-2 transition-colors"
            style={{ cursor: "pointer" }}
          >
            Create account
          </button>
        </p>
      )}
    </form>
  );
}

// ── Create account form ───────────────────────────────────────────────────────
function CreateAccountForm({ onSwitch }: { onSwitch: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          token: password,
          inviteCode: inviteCode.trim(),
        }),
      });
      if (res.ok) { window.location.href = "/"; return; }
      const data = await res.json();
      setError(data.error ?? "Registration failed");
    } catch {
      setError("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = username.trim().length >= 2 && password.length >= 8 && inviteCode.trim().length > 0;

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Choose a username"
        autoFocus
        autoComplete="username"
        className="w-full px-3 py-2.5 mb-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />

      <div className="relative mb-3">
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Choose a password  (8+ chars)"
          autoComplete="new-password"
          className="w-full px-3 py-2.5 pr-16 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-gray-500 hover:text-gray-300"
          style={{ cursor: "pointer" }}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>

      <input
        type="text"
        value={inviteCode}
        onChange={(e) => setInviteCode(e.target.value)}
        placeholder="Invite code  (ask your admin)"
        autoComplete="off"
        className="w-full px-3 py-2.5 mb-4 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />

      {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading || !canSubmit}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
        style={{ cursor: loading || !canSubmit ? "default" : "pointer" }}
      >
        {loading ? "Creating account…" : "Create account"}
      </button>

      <p className="mt-6 text-center text-xs text-gray-600">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSwitch}
          className="text-gray-400 hover:text-gray-200 underline underline-offset-2 transition-colors"
          style={{ cursor: "pointer" }}
        >
          Sign in
        </button>
      </p>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [registrationEnabled, setRegistrationEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/auth/config")
      .then(r => r.json())
      .then(d => setRegistrationEnabled(!!d.registrationEnabled))
      .catch(() => {});
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-100 text-center mb-1">
          2 Do Better
        </h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          {mode === "signin" ? "Sign in to continue" : "Create your account"}
        </p>

        {mode === "signin" ? (
          <SignInForm
            registrationEnabled={registrationEnabled}
            onSwitch={() => setMode("register")}
          />
        ) : (
          <CreateAccountForm onSwitch={() => setMode("signin")} />
        )}
      </div>
    </div>
  );
}
