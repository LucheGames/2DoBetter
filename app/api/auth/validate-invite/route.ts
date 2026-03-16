import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// Rate limit: 10 attempts per 5 minutes per IP.
// Prevents brute-forcing invite codes (900,000 possibilities).
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS    = 5 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now   = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (entry.count >= MAX_ATTEMPTS) return true;
  entry.count++;
  return false;
}

// GET /api/auth/validate-invite?code=XXXXXX
// Checks whether an invite code exists and is not expired — WITHOUT consuming it.
// Used by the /join page to show an immediate error if the code is bad.
export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? req.headers.get('x-real-ip')
          ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ valid: false, error: 'Too many attempts — try again later.' }, { status: 429 });
  }

  const code = req.nextUrl.searchParams.get('code')?.trim() ?? '';
  if (!code) {
    return NextResponse.json({ valid: false });
  }

  const invitesFile = path.join(process.cwd(), 'data', 'invites.json');
  if (!fs.existsSync(invitesFile)) {
    return NextResponse.json({ valid: false });
  }

  try {
    const invites: Array<{ code: string; expiresAt: string }> =
      JSON.parse(fs.readFileSync(invitesFile, 'utf8'));
    const now = Date.now();
    const found = invites.find(
      i => i.code === code && new Date(i.expiresAt).getTime() > now
    );
    return NextResponse.json({ valid: !!found });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
