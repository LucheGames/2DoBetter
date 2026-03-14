import { NextResponse } from 'next/server';

/** Public endpoint — tells the login page whether self-registration is enabled.
 *  Registration is gated by invite codes in data/invites.json, not an env var.
 *  Returns { registrationEnabled: boolean } with no sensitive data. */
export async function GET() {
  return NextResponse.json({ registrationEnabled: true });
}
