/**
 * Lane-mode authorization helpers.
 *
 * When a column has locked=true, only the column owner and admin users can
 * mutate its contents. All users can still:
 *   - Read everything (the board is always fully visible)
 *   - Toggle completed on any task (acknowledging done work)
 *
 * Additional per-user flags (set in users.json):
 *   readOnly: true       — token cannot make ANY writes (observer / monitor agent)
 *   ownColumnOnly: true  — token can only write to its own column; cross-column
 *                          push is also blocked (use for untrusted agents)
 *
 * Admin users (isAdmin=true in users.json) bypass all lane restrictions.
 * The first user created by `npm run setup` is automatically admin.
 */

import { NextResponse } from 'next/server';
import { getUsersFresh } from '@/lib/auth-helpers';

/** True if the given username has admin privileges. */
export function isAdminUser(username: string): boolean {
  const users = getUsersFresh();
  return users.find(u => u.username === username)?.isAdmin === true;
}

type ColumnSnapshot = {
  ownerUsername: string | null;
  locked: boolean;
};

/** Returns the supervisor username for a column's owning agent, if any. */
function getSupervisor(ownerUsername: string | null): string | undefined {
  if (!ownerUsername) return undefined;
  const users = getUsersFresh();
  return users.find(u => u.username === ownerUsername)?.supervisorUsername;
}

/**
 * Returns a 403 if the user's record has readOnly: true.
 * Call this first in every write route — it's a blanket write block.
 */
export function checkReadOnly(authUser: string | null): NextResponse | null {
  if (!authUser) return null; // unauthenticated handled elsewhere
  const user = getUsersFresh().find(u => u.username === authUser);
  if (user?.readOnly) {
    return NextResponse.json(
      { error: 'This token is read-only — no writes are allowed' },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Returns a 403 if the user has ownColumnOnly: true and the target column
 * is not theirs. Use this on routes that bypass checkLane (e.g. task creation /
 * cross-column push).
 */
export function checkOwnColumnOnly(
  column: ColumnSnapshot,
  authUser: string | null,
): NextResponse | null {
  if (!authUser) return null;
  if (isAdminUser(authUser)) return null;
  const user = getUsersFresh().find(u => u.username === authUser);
  if (user?.ownColumnOnly && column.ownerUsername !== authUser) {
    // Supervisor carve-out: can write to their supervised agent's column
    if (getSupervisor(column.ownerUsername) === authUser) return null;
    return NextResponse.json(
      { error: 'Your token is restricted to your own column' },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Returns a 403 NextResponse if the caller is NOT allowed to mutate
 * (rename, delete, move, reorder) items in this column.
 * Returns null if the operation is permitted.
 *
 * Pass `allowForAll: true` for operations that are always permitted
 * regardless of lock (e.g. toggling completed — cross-column ack).
 * Note: ownColumnOnly users are still blocked even with allowForAll=false;
 * use checkOwnColumnOnly separately for true bypass routes.
 */
export function checkLane(
  column: ColumnSnapshot,
  authUser: string | null,
  options: { allowForAll?: boolean } = {},
): NextResponse | null {
  // Operations explicitly allowed for everyone even in locked columns
  if (options.allowForAll) return null;

  // No auth user (shouldn't happen after middleware, but be safe)
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin override — bypasses all lane restrictions
  if (isAdminUser(authUser)) return null;

  // ownColumnOnly: restricted token can't write to non-owned columns even if unlocked
  const user = getUsersFresh().find(u => u.username === authUser);
  if (user?.ownColumnOnly && column.ownerUsername !== authUser) {
    return NextResponse.json(
      { error: 'Your token is restricted to your own column' },
      { status: 403 },
    );
  }

  // Unlocked column — fine for non-restricted users
  if (!column.locked) return null;

  // Locked column — column owner may proceed
  if (column.ownerUsername === authUser) return null;

  // Supervisor may also edit their supervised agent's locked column
  if (getSupervisor(column.ownerUsername) === authUser) return null;

  return NextResponse.json(
    { error: 'This column is locked — only the owner can edit it' },
    { status: 403 },
  );
}
