import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');
const BCRYPT_ROUNDS = 12;

// ── Cookie helpers ────────────────────────────────────────────────────────────

/** Write both auth cookies onto a response. auth_user is httpOnly:false so the
 *  UI can read the username without an extra API call. */
export function setAuthCookies(response: NextResponse, token: string, username: string) {
  const base = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  };
  response.cookies.set('auth_token', token, base);
  response.cookies.set('auth_user', username, { ...base, httpOnly: false });
}

// ── User store helpers ────────────────────────────────────────────────────────

export type UserRecord = {
  username: string;
  hash?: string;        // bcrypt hash (new users)
  token?: string;       // legacy plaintext password (migrated to hash on next login)
  session?: string;     // current session token (set on login, cleared on logout)
  agentToken?: string;  // permanent MCP/agent token — survives logout, rotate with gen-agent-token
};

/** Read users fresh from disk so auth operations see the latest data.
 *  Falls back to AUTH_USERS_JSON env var if the file doesn't exist. */
export function getUsersFresh(): UserRecord[] {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    try { return JSON.parse(process.env.AUTH_USERS_JSON || '[]'); } catch { return []; }
  }
}

/** Read users from AUTH_USERS_JSON env (set by server.js at startup). */
export function getUsers(): UserRecord[] {
  try { return JSON.parse(process.env.AUTH_USERS_JSON || '[]'); } catch { return []; }
}

/** Persist updated users list to disk + update the live process env so
 *  middleware picks up the change without a restart. */
export function saveUsers(users: UserRecord[]) {
  const json = JSON.stringify(users, null, 2);
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, json, { mode: 0o600 });
  process.env.AUTH_USERS_JSON = JSON.stringify(users); // live update — no restart needed
}

// ── Password / session helpers ────────────────────────────────────────────────

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Generate a cryptographically random session token. */
export function generateSession(): string {
  return randomBytes(32).toString('hex');
}

// ── Column provisioning ───────────────────────────────────────────────────────

/** Ensure the user has a column.
 *
 *  1. Already owns one → done.
 *  2. There is an unclaimed column whose name matches the username
 *     (case-insensitive) → claim it.  Handles migration from single-user
 *     installs where the column was named after the owner.
 *  3. No match → create a brand-new column.
 *
 *  We deliberately do NOT fall back to "first unclaimed by order" — that
 *  caused columns to be hijacked by the wrong user on first login.
 */
export async function ensureUserColumn(username: string) {
  const existing = await prisma.column.findFirst({ where: { ownerUsername: username } });
  if (existing) return;

  // Try to claim an unclaimed column whose name matches (SQLite: compare in JS)
  const unclaimed = await prisma.column.findMany({ where: { ownerUsername: null } });
  const match = unclaimed.find(c => c.name.toLowerCase() === username.toLowerCase());
  if (match) {
    await prisma.column.update({ where: { id: match.id }, data: { ownerUsername: username } });
    return;
  }

  // New user — create a fresh column
  const agg = await prisma.column.aggregate({ _max: { order: true } });
  const nextOrder = (agg._max.order ?? -1) + 1;
  const slug = `${username.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
  await prisma.column.create({
    data: { name: username, slug, order: nextOrder, ownerUsername: username },
  });
}
