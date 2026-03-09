"use client";

import { useEffect, useRef, useState } from "react";

// ── Sign-in form ──────────────────────────────────────────────────────────────
function SignInForm({
  registrationEnabled,
  onSwitch,
}: {
  registrationEnabled: boolean;
  onSwitch: () => void;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // Refs let us read the actual DOM value at submit time, which works even
  // when a password manager fills the fields without triggering onChange.
  const usernameRef = useRef<HTMLInputElement>(null);
  const tokenRef    = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Read from DOM — handles password-manager autofill where React state may be stale
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

  return (
    <form onSubmit={handleSubmit}>
      <input
        ref={usernameRef}
        type="text"
        name="username"
        placeholder="Username"
        required
        autoFocus
        autoComplete="username"
        className="w-full px-3 py-2.5 mb-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />

      <div className="relative mb-4">
        <input
          ref={tokenRef}
          type={showToken ? "text" : "password"}
          name="token"
          placeholder="Password"
          required
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
        disabled={loading}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
        style={{ cursor: loading ? "default" : "pointer" }}
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
function CreateAccountForm({
  onSwitch,
  prefillInvite,
}: {
  onSwitch: () => void;
  prefillInvite?: string;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const usernameRef   = useRef<HTMLInputElement>(null);
  const passwordRef   = useRef<HTMLInputElement>(null);
  const inviteCodeRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const username   = usernameRef.current?.value?.trim()   ?? "";
    const password   = passwordRef.current?.value           ?? "";
    const inviteCode = inviteCodeRef.current?.value?.trim() ?? "";

    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, token: password, inviteCode }),
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

  return (
    <form onSubmit={handleSubmit}>
      <input
        ref={usernameRef}
        type="text"
        name="username"
        placeholder="Choose a username"
        required
        minLength={2}
        autoFocus
        autoComplete="username"
        className="w-full px-3 py-2.5 mb-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />

      <div className="relative mb-3">
        <input
          ref={passwordRef}
          type={showPassword ? "text" : "password"}
          name="password"
          placeholder="Choose a password  (8+ chars)"
          required
          minLength={8}
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
        ref={inviteCodeRef}
        type="text"
        name="inviteCode"
        placeholder="Invite code"
        required
        autoComplete="off"
        defaultValue={prefillInvite ?? ""}
        className="w-full px-3 py-2.5 mb-4 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />

      {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
        style={{ cursor: loading ? "default" : "pointer" }}
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
  const [prefillInvite, setPrefillInvite] = useState<string | undefined>();

  useEffect(() => {
    fetch("/api/auth/config")
      .then(r => r.json())
      .then(d => setRegistrationEnabled(!!d.registrationEnabled))
      .catch(() => {});

    // Auto-switch to register mode if ?invite= is in the URL
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite");
    if (invite) {
      setPrefillInvite(invite);
      setMode("register");
    }
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
          <CreateAccountForm
            onSwitch={() => setMode("signin")}
            prefillInvite={prefillInvite}
          />
        )}
      </div>
    </div>
  );
}
