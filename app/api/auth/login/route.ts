import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type UserRecord = { username: string; token: string };

/** Set both auth cookies on a response (httpOnly for token, accessible for username) */
function setAuthCookies(response: NextResponse, token: string, username: string) {
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  };
  response.cookies.set('auth_token', token, cookieOpts);
  // auth_user is readable by JS so the UI can display the logged-in username
  response.cookies.set('auth_user', username, { ...cookieOpts, httpOnly: false });
}

/** Ensure the user has a column. Claim by name-match first, then create a new one.
 *
 *  Strategy (safest for migrations):
 *  1. Already have a column → done.
 *  2. Find an unclaimed column whose name matches the username (case-insensitive)
 *     → claim it.  This handles the migration from single-user where the column
 *     was named after the owner (e.g. "Dave").
 *  3. No name match → create a brand-new column.
 *
 *  We deliberately do NOT claim "first unclaimed by order" — that caused columns
 *  belonging to one person to be hijacked by a different user on their first login.
 */
async function ensureUserColumn(username: string) {
  const existing = await prisma.column.findFirst({ where: { ownerUsername: username } });
  if (existing) return;

  // Claim an unclaimed column whose name matches this username
  const namedMatch = await prisma.column.findFirst({
    where: {
      ownerUsername: null,
      name: { equals: username, mode: 'insensitive' },
    },
  });
  if (namedMatch) {
    await prisma.column.update({
      where: { id: namedMatch.id },
      data: { ownerUsername: username },
    });
    return;
  }

  // New user with no matching column — create a fresh one
  const agg = await prisma.column.aggregate({ _max: { order: true } });
  const nextOrder = (agg._max.order ?? -1) + 1;
  const slug = `${username.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
  await prisma.column.create({
    data: { name: username, slug, order: nextOrder, ownerUsername: username },
  });
}

export async function POST(req: NextRequest) {
  const { username, token } = await req.json();

  // ── Multi-user mode ────────────────────────────────────────────────────────
  const usersJson = process.env.AUTH_USERS_JSON;
  if (usersJson) {
    let users: UserRecord[];
    try {
      users = JSON.parse(usersJson);
    } catch {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const user = users.find(
      u => u.username.toLowerCase() === String(username ?? '').toLowerCase() && u.token === token
    );
    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Ensure this user has a column (create or claim on first login)
    await ensureUserColumn(user.username);

    const response = NextResponse.json({ ok: true });
    setAuthCookies(response, user.token, user.username);
    return response;
  }

  // ── Legacy single-user mode ───────────────────────────────────────────────
  const validToken = process.env.AUTH_TOKEN;
  const validUsername = process.env.AUTH_USERNAME || '';

  if (validUsername && String(username ?? '').toLowerCase() !== validUsername.toLowerCase()) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }
  if (!validToken || token !== validToken) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  // Ensure the legacy user also has a column (handles migrations)
  if (validUsername) {
    await ensureUserColumn(validUsername);
  }

  const response = NextResponse.json({ ok: true });
  setAuthCookies(response, token, validUsername || 'admin');
  return response;
}
