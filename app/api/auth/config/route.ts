import { NextResponse } from 'next/server';

/** Public endpoint — tells the login page whether self-registration is enabled.
 *  Returns { registrationEnabled: boolean } with no sensitive data. */
export async function GET() {
  return NextResponse.json({
    registrationEnabled: !!process.env.INVITE_CODE,
  });
}
