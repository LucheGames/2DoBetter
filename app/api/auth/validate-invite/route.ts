import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// GET /api/auth/validate-invite?code=XXXX
// Checks whether an invite code exists and is not expired — WITHOUT consuming it.
// Used by the /join page to show an immediate error if the code is bad.
export async function GET(req: NextRequest) {
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
