import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getUsersFresh, saveUsers, ensureUserColumn } from '@/lib/auth-helpers';
import { isAdminUser } from '@/lib/lane-guard';
import { broadcast } from '@/lib/events';

// POST /api/admin/create-agent — admin only; creates an agent user + column directly
export async function POST(req: NextRequest) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser || !isAdminUser(authUser)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { agentName, supervisorUsername, ownColumnOnly } = await req.json();
  const cleanName = String(agentName ?? '').trim();
  if (cleanName.length < 2) {
    return NextResponse.json({ error: 'Agent name must be at least 2 characters.' }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_\-. ]+$/.test(cleanName)) {
    return NextResponse.json({ error: 'Agent name may only contain letters, numbers, spaces, hyphens, underscores and dots.' }, { status: 400 });
  }

  const users = getUsersFresh();
  if (users.some(u => u.username.toLowerCase() === cleanName.toLowerCase())) {
    return NextResponse.json({ error: 'That name is already taken.' }, { status: 409 });
  }

  if (supervisorUsername) {
    const sup = users.find(u => u.username === supervisorUsername);
    if (!sup) return NextResponse.json({ error: 'Supervisor not found.' }, { status: 404 });
    if (sup.isAgent) return NextResponse.json({ error: 'Supervisor must be a human user.' }, { status: 400 });
  }

  const agentToken = randomBytes(32).toString('hex');
  const newAgent: Parameters<typeof users.push>[0] = {
    username: cleanName,
    isAgent: true,
    agentToken,
  };
  if (supervisorUsername) newAgent.supervisorUsername = supervisorUsername;
  if (ownColumnOnly)      newAgent.ownColumnOnly      = true;

  users.push(newAgent);
  saveUsers(users);

  await ensureUserColumn(cleanName);
  broadcast();

  return NextResponse.json({ ok: true, agentToken }, { status: 201 });
}
