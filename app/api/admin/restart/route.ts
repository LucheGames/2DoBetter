import { NextRequest, NextResponse, after } from 'next/server';
import { isAdminUser } from '@/lib/lane-guard';

// POST /api/admin/restart — graceful server restart (admin only)
// Sends response first, then exits the process. The service manager
// (systemd/launchd) restarts it automatically.
export async function POST(req: NextRequest) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  // Schedule exit after the response is sent
  after(() => {
    setTimeout(() => process.exit(0), 500);
  });

  return NextResponse.json({ ok: true, message: 'Server restarting...' });
}
