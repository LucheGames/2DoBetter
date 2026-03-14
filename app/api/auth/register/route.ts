import { NextRequest, NextResponse } from 'next/server';
import {
  setAuthCookies, ensureUserColumn, getUsersFresh, saveUsers,
  hashPassword, generateSession,
} from '@/lib/auth-helpers';
import { broadcast } from '@/lib/events';
import * as fs from 'fs';
import * as path from 'path';

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
  const { username, token, inviteCode } = await req.json();

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
  broadcast(); // notify connected clients that a new column has appeared

  const response = NextResponse.json({ ok: true });
  setAuthCookies(response, session, cleanUsername);
  return response;
}
