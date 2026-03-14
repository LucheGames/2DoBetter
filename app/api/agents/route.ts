import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getUsersFresh, saveUsers, ensureUserColumn } from '@/lib/auth-helpers';
import { broadcast } from '@/lib/events';
import { checkReadOnly } from '@/lib/lane-guard';

// POST /api/agents — any authenticated, non-readonly, non-agent human can create a personal agent
export async function POST(req: NextRequest) {
  const authUser = req.headers.get('x-auth-user');
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roBlock = checkReadOnly(authUser);
  if (roBlock) return roBlock;

  const users = getUsersFresh();
  const caller = users.find(u => u.username === authUser);
  if (caller?.isAgent) {
    return NextResponse.json({ error: 'Agents cannot create agents' }, { status: 403 });
  }

  const { agentName } = await req.json();
  const cleanName = String(agentName ?? '').trim();
  if (cleanName.length < 2) {
    return NextResponse.json({ error: 'Agent name must be at least 2 characters.' }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_\-. ]+$/.test(cleanName)) {
    return NextResponse.json({ error: 'Agent name may only contain letters, numbers, spaces, hyphens, underscores and dots.' }, { status: 400 });
  }
  if (users.some(u => u.username.toLowerCase() === cleanName.toLowerCase())) {
    return NextResponse.json({ error: 'That name is already taken.' }, { status: 409 });
  }

  const agentToken = randomBytes(32).toString('hex');
  users.push({
    username: cleanName,
    isAgent: true,
    supervisorUsername: authUser,
    agentToken,
  });
  saveUsers(users);

  await ensureUserColumn(cleanName);
  broadcast();

  return NextResponse.json({ ok: true, agentToken }, { status: 201 });
}
