import { NextRequest, NextResponse } from 'next/server';
import { getUsersFresh, saveUsers, generateSession } from '@/lib/auth-helpers';

// In-memory rate limiter — 5 attempts per username per 15 minutes
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX       = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

function checkRate(key: string): boolean {
  const now   = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count++;
  return true;
}

// POST /api/auth/verify-temp-code — validate username + 8-digit temp code
// Returns a short-lived resetToken the client uses to set a new password.
export async function POST(req: NextRequest) {
  const { username, code } = await req.json() as { username?: string; code?: string };
  if (!username || !code) {
    return NextResponse.json({ error: 'username and code required' }, { status: 400 });
  }

  const normUser = username.toLowerCase().trim();
  if (!checkRate(normUser)) {
    return NextResponse.json(
      { error: 'Too many attempts — try again in 15 minutes.' },
      { status: 429 },
    );
  }

  const users = getUsersFresh();
  const idx = users.findIndex(u => u.username.toLowerCase() === normUser);
  if (idx === -1) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
  }

  const user = users[idx];
  if (!user.tempCode || !user.tempCodeExpiry) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
  }
  if (user.tempCode !== code) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
  }
  if (new Date(user.tempCodeExpiry) < new Date()) {
    return NextResponse.json({ error: 'Code expired — ask your admin for a new one.' }, { status: 401 });
  }

  // Issue a short-lived reset token (5 min) — client uses this to set a new password
  const resetToken = generateSession();
  users[idx].resetToken = resetToken;
  users[idx].resetTokenExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  // Clear the temp code so it can't be reused
  delete users[idx].tempCode;
  delete users[idx].tempCodeExpiry;
  saveUsers(users);

  return NextResponse.json({ valid: true, resetToken });
}
