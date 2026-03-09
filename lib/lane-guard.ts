/**
 * Lane-mode authorization helpers.
 *
 * When a column has locked=true, only the column owner and admin users can
 * mutate its contents. All users can still:
 *   - Read everything (the board is always fully visible)
 *   - Create tasks in any list (cross-column "push" — low risk)
 *   - Toggle completed on any task (acknowledging done work)
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

/**
 * Returns a 403 NextResponse if the caller is NOT allowed to mutate
 * (rename, delete, move, reorder) items in this column.
 * Returns null if the operation is permitted.
 *
 * Pass `allowForAll: true` for operations that are always permitted
 * regardless of lock (e.g. creating a task = cross-column push).
 */
export function checkLane(
  column: ColumnSnapshot,
  authUser: string | null,
  options: { allowForAll?: boolean } = {},
): NextResponse | null {
  // Operations explicitly allowed for everyone even in locked columns
  if (options.allowForAll) return null;

  // Unlocked column — anyone can do anything
  if (!column.locked) return null;

  // No auth user (shouldn't happen after middleware, but be safe)
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin override
  if (isAdminUser(authUser)) return null;

  // Column owner
  if (column.ownerUsername === authUser) return null;

  return NextResponse.json(
    { error: 'This column is locked — only the owner can edit it' },
    { status: 403 },
  );
}
