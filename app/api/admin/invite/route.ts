import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { isAdminUser } from '@/lib/lane-guard';

interface Invite {
  code: string;
  createdAt: string;
  expiresAt: string;
  label?: string;
  readOnly?: boolean;
  ownColumnOnly?: boolean;
  isAgent?: boolean;
}

// POST /api/admin/invite — generate a time-limited single-use invite (admin only)
// Body: { label?, expiresInMinutes?, readOnly?, ownColumnOnly?, isAgent? }
// Returns: { code, url, expiresAt }
export async function POST(req: NextRequest) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const {
    label           = '',
    expiresInMinutes = 10,
    readOnly        = false,
    ownColumnOnly   = false,
    isAgent         = false,
  } = await req.json().catch(() => ({}));

  // 4-digit numeric PIN (1000–9998), cryptographically random
  const code      = String(1000 + (randomBytes(2).readUInt16BE(0) % 9000));
  const now       = new Date();
  const expiresAt = new Date(now.getTime() + Number(expiresInMinutes) * 60 * 1000);

  const invite: Invite = {
    code,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ...(label         ? { label }         : {}),
    ...(readOnly      ? { readOnly }      : {}),
    ...(ownColumnOnly ? { ownColumnOnly } : {}),
    ...(isAgent       ? { isAgent }       : {}),
  };

  const invitesFile = path.join(process.cwd(), 'data', 'invites.json');
  let invites: Invite[] = [];
  try {
    if (fs.existsSync(invitesFile)) {
      invites = JSON.parse(fs.readFileSync(invitesFile, 'utf8'));
    }
  } catch { /* start fresh */ }

  invites.push(invite);
  fs.mkdirSync(path.dirname(invitesFile), { recursive: true });
  fs.writeFileSync(invitesFile, JSON.stringify(invites, null, 2), { mode: 0o600 });

  // Build the registration URL from the request host
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  const host  = req.headers.get('host') ?? 'localhost:3000';
  const url   = `${proto}://${host}/join?code=${code}`;

  return NextResponse.json({ code, url, expiresAt: expiresAt.toISOString() });
}
