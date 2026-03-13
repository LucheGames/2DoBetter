import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  setAuthCookies, ensureUserColumn,
  getUsersFresh, saveUsers,
  hashPassword, verifyPassword, generateSession,
} from '@/lib/auth-helpers';

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

// ── Simple in-memory rate limiter ─────────────────────────────────────────────
// 10 attempts per IP per 15 minutes. Resets on server restart (acceptable for
// a self-hosted app — persistent storage would be overkill here).
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX       = 10;
const loginAttempts  = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now   = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? req.headers.get('x-real-ip')
          ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many login attempts — try again in 15 minutes.' },
      { status: 429 }
    );
  }
  const { username, token } = await req.json();

  // ── Multi-user mode ────────────────────────────────────────────────────────
  const usersFileExists = fs.existsSync(USERS_FILE);
  if (usersFileExists || process.env.AUTH_USERS_JSON) {
    const users = getUsersFresh();
    const userIdx = users.findIndex(
      u => u.username.toLowerCase() === String(username ?? '').toLowerCase()
    );

    if (userIdx === -1) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const user = users[userIdx];
    let authenticated = false;

    if (user.hash) {
      // Modern bcrypt verification
      authenticated = await verifyPassword(String(token), user.hash);
    } else if (user.token) {
      // Legacy plaintext — verify then migrate to bcrypt hash
      authenticated = user.token === String(token);
      if (authenticated) {
        users[userIdx].hash = await hashPassword(String(token));
        delete users[userIdx].token;
      }
    }

    if (!authenticated) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Issue a new session token — supports multiple concurrent devices.
    // Migrate legacy single-session field to array on first multi-device login.
    const session = generateSession();
    if (!users[userIdx].sessions) users[userIdx].sessions = [];
    if (users[userIdx].session) {
      // absorb the old single-session token so existing browsers don't get logged out
      users[userIdx].sessions!.push(users[userIdx].session!);
      delete users[userIdx].session;
    }
    users[userIdx].sessions!.push(session);
    // Cap at 10 sessions (oldest evicted first)
    if (users[userIdx].sessions!.length > 10) {
      users[userIdx].sessions!.splice(0, users[userIdx].sessions!.length - 10);
    }
    saveUsers(users);

    await ensureUserColumn(user.username);
    const response = NextResponse.json({ ok: true });
    setAuthCookies(response, session, user.username);
    return response;
  }

  // ── Legacy single-user mode (AUTH_TOKEN env var) ───────────────────────────
  const validToken = process.env.AUTH_TOKEN;
  const validUsername = process.env.AUTH_USERNAME || '';

  if (validUsername && String(username ?? '').toLowerCase() !== validUsername.toLowerCase()) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  if (!validToken || token !== validToken) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  if (validUsername) await ensureUserColumn(validUsername);

  const response = NextResponse.json({ ok: true });
  setAuthCookies(response, token, validUsername || 'admin');
  return response;
}
