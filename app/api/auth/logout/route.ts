import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // Clear both auth cookies
  const clear = { httpOnly: true, path: '/', maxAge: 0, expires: new Date(0) };
  response.cookies.set('auth_token', '', clear);
  response.cookies.set('auth_user', '', { ...clear, httpOnly: false });
  return response;
}
