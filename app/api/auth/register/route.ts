import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import {
  setAuthCookies, ensureUserColumn, getUsersFresh, saveUsers,
  hashPassword, generateSession,
} from '@/lib/auth-helpers';
import { broadcast } from '@/lib/events';
import * as fs from 'fs';
import * as path from 'path';

// ── Per-IP rate limit (shared with login: 10 attempts / 15 min) ─────────────
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX       = 10;
const ipAttempts     = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now   = Date.now();
  const entry = ipAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    ipAttempts.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count++;
  return true;
}

// ── Invite validation ─────────────────────────────────────────────────────────
// Invite codes live in data/invites.json — managed by `npm run gen-invite`
// or generated from the admin panel.
// Each code is single-use and time-limited. Expired / used codes are pruned on read.
// Invites may carry access flags (readOnly, ownColumnOnly, isAgent) that are
// applied to the new user's account on registration.

interface Invite {
  code: string;
  createdAt: string;
  expiresAt: string;
  label?: string;
  readOnly?: boolean;
  ownColumnOnly?: boolean;
  isAgent?: boolean;
}

/** Validate, consume, and return the invite. Returns null if invalid/expired. */
function consumeInvite(code: string): Invite | null {
  const invitesFile = path.join(process.cwd(), 'data', 'invites.json');
  if (!fs.existsSync(invitesFile)) return null;

  let invites: Invite[];
  try {
    invites = JSON.parse(fs.readFileSync(invitesFile, 'utf8'));
  } catch {
    return null;
  }

  const now = Date.now();
  // Purge expired codes while we're here
  const active = invites.filter(i => new Date(i.expiresAt).getTime() > now);
  const idx = active.findIndex(i => i.code === code);
  if (idx === -1) return null; // not found or expired

  // Remove the matched code — single use
  const matched = active[idx];
  active.splice(idx, 1);
  fs.writeFileSync(invitesFile, JSON.stringify(active, null, 2), { mode: 0o600 });
  return matched;
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? req.headers.get('x-real-ip')
          ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts — try again in 15 minutes.' },
      { status: 429 }
    );
  }

  const { username, token, inviteCode, agentName } = await req.json();

  const invite = consumeInvite(String(inviteCode ?? '').trim());
  if (!invite) {
    return NextResponse.json({ error: 'Invalid or expired invite code.' }, { status: 401 });
  }

  const cleanUsername = String(username ?? '').trim();
  if (cleanUsername.length < 2) {
    return NextResponse.json({ error: 'Username must be at least 2 characters.' }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_\-. ]+$/.test(cleanUsername)) {
    return NextResponse.json({ error: 'Username may only contain letters, numbers, spaces, hyphens, underscores and dots.' }, { status: 400 });
  }
  if (!token || String(token).length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const users = getUsersFresh();
  if (users.some(u => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
    return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
  }

  // Hash password and generate session before persisting
  const hash = await hashPassword(String(token));
  const session = generateSession();

  // Apply any access flags encoded in the invite
  const newUser: Parameters<typeof users.push>[0] = { username: cleanUsername, hash, session };
  if (invite.readOnly)      newUser.readOnly      = true;
  if (invite.ownColumnOnly) newUser.ownColumnOnly = true;
  if (invite.isAgent)       newUser.isAgent       = true;

  users.push(newUser);
  try {
    saveUsers(users);
  } catch {
    return NextResponse.json({ error: 'Could not save user — check server permissions.' }, { status: 500 });
  }

  await ensureUserColumn(cleanUsername);

  // Optional: create a personal agent column supervised by this user
  const cleanAgentName = String(agentName ?? '').trim();
  if (cleanAgentName.length >= 2 && /^[a-zA-Z0-9_\-. ]+$/.test(cleanAgentName)) {
    const updatedUsers = getUsersFresh();
    if (!updatedUsers.some(u => u.username.toLowerCase() === cleanAgentName.toLowerCase())) {
      const agentToken = randomBytes(32).toString('hex');
      updatedUsers.push({
        username: cleanAgentName,
        isAgent: true,
        supervisorUsername: cleanUsername,
        agentToken,
      });
      saveUsers(updatedUsers);
      await ensureUserColumn(cleanAgentName);
    }
  }

  broadcast(); // notify connected clients that a new column has appeared

  const response = NextResponse.json({ ok: true });
  setAuthCookies(response, session, cleanUsername);
  return response;
}
